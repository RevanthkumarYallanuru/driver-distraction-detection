import cv2
import mediapipe as mp
import math
import time
import pyttsx3
import threading


# ==========================================
# Configuration
# ==========================================

MODEL_PATH = "models/face_landmarker.task"

# Initial EAR threshold
EAR_THRESHOLD = 0.22

# Eyes must remain closed for this long
# before drowsiness is detected
DROWSINESS_TIME = 1.5

# Minimum time between voice warnings
WARNING_COOLDOWN = 5.0


# ==========================================
# Voice Assistant
# ==========================================

def speak_warning():
    """
    Speaks the warning without blocking
    the camera processing.
    """

    def voice_worker():

        engine = pyttsx3.init()

        # Speech speed
        engine.setProperty("rate", 165)

        # Volume: 0.0 - 1.0
        engine.setProperty("volume", 1.0)

        engine.say(
            "Warning. Eyes closed. Please stay alert."
        )

        engine.runAndWait()

        engine.stop()

    # Run voice in background thread
    thread = threading.Thread(
        target=voice_worker,
        daemon=True
    )

    thread.start()


# ==========================================
# Calculate distance between two points
# ==========================================

def distance(point1, point2):

    return math.sqrt(
        (point1[0] - point2[0]) ** 2
        +
        (point1[1] - point2[1]) ** 2
    )


# ==========================================
# Calculate Eye Aspect Ratio
# ==========================================

def calculate_ear(
    landmarks,
    eye_indices,
    width,
    height
):

    points = []

    for index in eye_indices:

        landmark = landmarks[index]

        x = landmark.x * width
        y = landmark.y * height

        points.append((x, y))


    # Six eye points
    p1, p2, p3, p4, p5, p6 = points


    # Vertical distances
    vertical_1 = distance(p2, p6)

    vertical_2 = distance(p3, p5)


    # Horizontal distance
    horizontal = distance(p1, p4)


    if horizontal == 0:

        return 0.0


    # EAR formula
    ear = (
        vertical_1 + vertical_2
    ) / (2.0 * horizontal)


    return ear


# ==========================================
# MediaPipe setup
# ==========================================

BaseOptions = mp.tasks.BaseOptions

FaceLandmarker = (
    mp.tasks.vision.FaceLandmarker
)

FaceLandmarkerOptions = (
    mp.tasks.vision.FaceLandmarkerOptions
)

RunningMode = (
    mp.tasks.vision.RunningMode
)


options = FaceLandmarkerOptions(

    base_options=BaseOptions(
        model_asset_path=MODEL_PATH
    ),

    running_mode=RunningMode.VIDEO,

    num_faces=1,

    min_face_detection_confidence=0.5,

    min_face_presence_confidence=0.5,

    min_tracking_confidence=0.5,
)


# ==========================================
# Eye landmark indices
# ==========================================

LEFT_EYE = [

    33,
    160,
    158,
    133,
    153,
    144

]


RIGHT_EYE = [

    362,
    385,
    387,
    263,
    373,
    380

]


# ==========================================
# Drowsiness variables
# ==========================================

eyes_closed_start = None

drowsiness_detected = False

last_warning_time = 0


# ==========================================
# Start Face Landmarker
# ==========================================

with FaceLandmarker.create_from_options(
    options
) as landmarker:


    # --------------------------------------
    # Start webcam
    # --------------------------------------

    cap = cv2.VideoCapture(0)


    if not cap.isOpened():

        print(
            "ERROR: Could not open camera."
        )

        exit()


    # MediaPipe VIDEO mode requires
    # increasing timestamps
    timestamp_ms = 0


    # ======================================
    # Main camera loop
    # ======================================

    while True:


        # ----------------------------------
        # Read camera frame
        # ----------------------------------

        success, frame = cap.read()


        if not success:

            print(
                "ERROR: Could not read frame."
            )

            break


        # ----------------------------------
        # Convert BGR → RGB
        # ----------------------------------

        rgb_frame = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )


        # ----------------------------------
        # Create MediaPipe image
        # ----------------------------------

        mp_image = mp.Image(

            image_format=mp.ImageFormat.SRGB,

            data=rgb_frame

        )


        # ----------------------------------
        # Detect face landmarks
        # ----------------------------------

        result = landmarker.detect_for_video(

            mp_image,

            timestamp_ms

        )


        # Increase timestamp
        timestamp_ms += 33


        # ==================================
        # If face detected
        # ==================================

        if result.face_landmarks:


            # Use first detected face
            face_landmarks = (
                result.face_landmarks[0]
            )


            height, width, _ = frame.shape


            # ==================================
            # Calculate left eye EAR
            # ==================================

            left_ear = calculate_ear(

                face_landmarks,

                LEFT_EYE,

                width,

                height

            )


            # ==================================
            # Calculate right eye EAR
            # ==================================

            right_ear = calculate_ear(

                face_landmarks,

                RIGHT_EYE,

                width,

                height

            )


            # ==================================
            # Average EAR
            # ==================================

            ear = (
                left_ear + right_ear
            ) / 2.0


            # ==================================
            # Determine eye state
            # ==================================

            if ear < EAR_THRESHOLD:


                eye_status = "CLOSED"


                # --------------------------------
                # Start closed-eye timer
                # --------------------------------

                if eyes_closed_start is None:

                    eyes_closed_start = time.time()


                # --------------------------------
                # Calculate closed duration
                # --------------------------------

                closed_duration = (
                    time.time()
                    -
                    eyes_closed_start
                )


                # --------------------------------
                # Drowsiness detection
                # --------------------------------

                if (
                    closed_duration
                    >= DROWSINESS_TIME
                ):

                    drowsiness_detected = True


                    # Current time
                    current_time = time.time()


                    # --------------------------------
                    # Voice warning cooldown
                    # --------------------------------

                    if (
                        current_time
                        -
                        last_warning_time
                        >= WARNING_COOLDOWN
                    ):

                        speak_warning()

                        last_warning_time = (
                            current_time
                        )


            else:


                eye_status = "OPEN"


                # --------------------------------
                # Reset closed-eye timer
                # --------------------------------

                eyes_closed_start = None


                # --------------------------------
                # Reset drowsiness state
                # --------------------------------

                drowsiness_detected = False


            # ==================================
            # Draw eye landmarks
            # ==================================

            for index in (
                LEFT_EYE + RIGHT_EYE
            ):


                landmark = (
                    face_landmarks[index]
                )


                x = int(
                    landmark.x * width
                )

                y = int(
                    landmark.y * height
                )


                cv2.circle(

                    frame,

                    (x, y),

                    3,

                    (0, 255, 255),

                    -1

                )


            # ==================================
            # Display EAR
            # ==================================

            cv2.putText(

                frame,

                f"EAR: {ear:.3f}",

                (30, 40),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.8,

                (255, 255, 255),

                2

            )


            # ==================================
            # Display eye status
            # ==================================

            cv2.putText(

                frame,

                f"Eyes: {eye_status}",

                (30, 75),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.8,

                (255, 255, 255),

                2

            )


            # ==================================
            # Display closed duration
            # ==================================

            if eyes_closed_start is not None:


                closed_duration = (
                    time.time()
                    -
                    eyes_closed_start
                )


                cv2.putText(

                    frame,

                    f"Closed: {closed_duration:.1f}s",

                    (30, 110),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    0.8,

                    (255, 255, 255),

                    2

                )


            # ==================================
            # Display drowsiness status
            # ==================================

            if drowsiness_detected:


                cv2.putText(

                    frame,

                    "DROWSINESS DETECTED!",

                    (30, 160),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    1.0,

                    (0, 0, 255),

                    3

                )


                # Additional status
                cv2.putText(

                    frame,

                    "VOICE ALERT ACTIVE",

                    (30, 195),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    0.7,

                    (0, 0, 255),

                    2

                )


            else:


                cv2.putText(

                    frame,

                    "STATUS: NORMAL",

                    (30, 160),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    0.8,

                    (0, 255, 0),

                    2

                )


        else:


            # ==================================
            # No face detected
            # ==================================

            cv2.putText(

                frame,

                "NO DRIVER FACE DETECTED",

                (30, 40),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.8,

                (0, 0, 255),

                2

            )


        # ==================================
        # Display camera
        # ==================================

        cv2.imshow(

            "Driver Monitoring System",

            frame

        )


        # ==================================
        # Quit with Q
        # ==================================

        if (
            cv2.waitKey(1) & 0xFF
            == ord("q")
        ):

            break


    # ======================================
    # Release camera
    # ======================================

    cap.release()


# ==========================================
# Close OpenCV windows
# ==========================================

cv2.destroyAllWindows()