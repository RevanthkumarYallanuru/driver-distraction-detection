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

# How long the driver must look away
# before distraction is confirmed
LOOK_AWAY_TIME = 1.5

# Minimum time between voice warnings
WARNING_COOLDOWN = 5.0


# ==========================================
# Voice Alert
# ==========================================

def speak_warning(message):
    """
    Speak the warning in a background thread
    so camera processing does not freeze.
    """

    def voice_worker():

        engine = pyttsx3.init()

        # JARVIS-inspired calm robotic speed
        engine.setProperty("rate", 165)
        engine.setProperty("volume", 1.0)

        engine.say(message)
        engine.runAndWait()

        engine.stop()

    thread = threading.Thread(
        target=voice_worker,
        daemon=True
    )

    thread.start()


# ==========================================
# Distance between two points
# ==========================================

def distance(point1, point2):

    return math.sqrt(
        (point1[0] - point2[0]) ** 2
        +
        (point1[1] - point2[1]) ** 2
    )


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
# Head Pose Landmarks
# ==========================================

NOSE = 1
LEFT_FACE = 234
RIGHT_FACE = 454


# ==========================================
# Looking-away state
# ==========================================

looking_away_start = None

current_direction = "CENTER"

last_warning_time = 0


# ==========================================
# Start Face Landmarker
# ==========================================

with FaceLandmarker.create_from_options(
    options
) as landmarker:

    # ======================================
    # Start webcam
    # ======================================

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():

        print("ERROR: Could not open camera.")
        exit()

    timestamp_ms = 0


    # ======================================
    # Main camera loop
    # ======================================

    while True:

        success, frame = cap.read()

        if not success:

            print("ERROR: Could not read frame.")
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

        timestamp_ms += 33


        # ==================================
        # Face detected
        # ==================================

        if result.face_landmarks:

            face_landmarks = result.face_landmarks[0]

            height, width, _ = frame.shape


            # ----------------------------------
            # Get important landmarks
            # ----------------------------------

            nose = face_landmarks[NOSE]

            left_face = face_landmarks[LEFT_FACE]

            right_face = face_landmarks[RIGHT_FACE]


            # ----------------------------------
            # Convert normalized coordinates
            # to pixel coordinates
            # ----------------------------------

            nose_point = (
                nose.x * width,
                nose.y * height
            )

            left_point = (
                left_face.x * width,
                left_face.y * height
            )

            right_point = (
                right_face.x * width,
                right_face.y * height
            )


            # ----------------------------------
            # Calculate distances
            # ----------------------------------

            left_distance = distance(
                nose_point,
                left_point
            )

            right_distance = distance(
                nose_point,
                right_point
            )


            total_distance = (
                left_distance
                +
                right_distance
            )


            # Prevent division by zero
            if total_distance == 0:

                ratio = 0.5

            else:

                ratio = (
                    left_distance
                    /
                    total_distance
                )


            # ==================================
            # Determine head direction
            # ==================================

            if ratio < 0.40:

                direction = "RIGHT"

            elif ratio > 0.60:

                direction = "LEFT"

            else:

                direction = "CENTER"


            current_direction = direction


            # ==================================
            # Looking-away detection
            # ==================================

            if direction == "LEFT" or direction == "RIGHT":

                # Start timer
                if looking_away_start is None:

                    looking_away_start = time.time()


                # Calculate duration
                looking_away_duration = (
                    time.time()
                    -
                    looking_away_start
                )


                # ----------------------------------
                # Confirm distraction
                # ----------------------------------

                if looking_away_duration >= LOOK_AWAY_TIME:

                    current_time = time.time()


                    # ----------------------------------
                    # Voice cooldown
                    # ----------------------------------

                    if (
                        current_time
                        -
                        last_warning_time
                        >= WARNING_COOLDOWN
                    ):

                        speak_warning(
                            "Warning. Please keep your eyes on the road."
                        )

                        last_warning_time = current_time


            else:

                # Driver returned to center
                looking_away_start = None


            # ==================================
            # Draw important landmarks
            # ==================================

            for point in [
                nose_point,
                left_point,
                right_point
            ]:

                cv2.circle(
                    frame,
                    (
                        int(point[0]),
                        int(point[1])
                    ),
                    6,
                    (0, 255, 255),
                    -1
                )


            # ==================================
            # Display direction
            # ==================================

            cv2.putText(
                frame,
                f"Head: {direction}",
                (30, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255, 255, 255),
                2
            )


            # ==================================
            # Display ratio
            # ==================================

            cv2.putText(
                frame,
                f"Ratio: {ratio:.2f}",
                (30, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2
            )


            # ==================================
            # Display looking-away duration
            # ==================================

            if looking_away_start is not None:

                looking_away_duration = (
                    time.time()
                    -
                    looking_away_start
                )

                cv2.putText(
                    frame,
                    f"Away: {looking_away_duration:.1f}s",
                    (30, 110),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (255, 255, 255),
                    2
                )


            # ==================================
            # Distraction warning
            # ==================================

            if (
                looking_away_start is not None
                and looking_away_duration
                >= LOOK_AWAY_TIME
            ):

                cv2.putText(
                    frame,
                    "DISTRACTION DETECTED!",
                    (30, 160),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    (0, 0, 255),
                    3
                )

                cv2.putText(
                    frame,
                    "PLEASE LOOK AT THE ROAD",
                    (30, 200),
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


        # ==================================
        # No face detected
        # ==================================

        else:

            looking_away_start = None

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
            "Driver Head Pose Monitor",
            frame
        )


        # ==================================
        # Quit
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


cv2.destroyAllWindows()