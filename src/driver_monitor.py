import cv2
import mediapipe as mp
import math
import time
import threading
from ultralytics import YOLO
import pyttsx3


# =========================================================
# CONFIGURATION
# =========================================================

FACE_MODEL_PATH = "models/face_landmarker.task"
YOLO_MODEL_PATH = "yolo11n.pt"

EAR_THRESHOLD = 0.22

DROWSINESS_TIME = 1.5
LOOK_AWAY_TIME = 1.5
PHONE_DETECTION_TIME = 1.5

WARNING_COOLDOWN = 5.0

PHONE_CONFIDENCE = 0.50


# =========================================================
# MEDIA PIPE SETUP
# =========================================================

BaseOptions = mp.tasks.BaseOptions

FaceLandmarker = mp.tasks.vision.FaceLandmarker

FaceLandmarkerOptions = (
    mp.tasks.vision.FaceLandmarkerOptions
)

RunningMode = mp.tasks.vision.RunningMode


face_options = FaceLandmarkerOptions(

    base_options=BaseOptions(
        model_asset_path=FACE_MODEL_PATH
    ),

    running_mode=RunningMode.VIDEO,

    num_faces=1,

    min_face_detection_confidence=0.5,

    min_face_presence_confidence=0.5,

    min_tracking_confidence=0.5,
)


# =========================================================
# LANDMARK INDICES
# =========================================================

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

NOSE = 1

LEFT_FACE = 234

RIGHT_FACE = 454


# =========================================================
# YOLO
# =========================================================

print("Loading YOLO model...")

yolo_model = YOLO(YOLO_MODEL_PATH)

print("YOLO model loaded.")


# COCO class ID
# 67 = cell phone
PHONE_CLASS_ID = 67


# =========================================================
# STATE VARIABLES
# =========================================================

eyes_closed_start = None

looking_away_start = None

phone_detected_start = None

last_warning_time = 0

current_alert = None


# =========================================================
# DISTANCE FUNCTION
# =========================================================

def distance(point1, point2):

    return math.sqrt(

        (point1[0] - point2[0]) ** 2

        +

        (point1[1] - point2[1]) ** 2
    )


# =========================================================
# EAR CALCULATION
# =========================================================

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


    p1, p2, p3, p4, p5, p6 = points


    vertical_1 = distance(p2, p6)

    vertical_2 = distance(p3, p5)

    horizontal = distance(p1, p4)


    if horizontal == 0:

        return 0.0


    ear = (

        vertical_1

        +

        vertical_2

    ) / (2.0 * horizontal)


    return ear


# =========================================================
# VOICE ALERT
# =========================================================

def speak_warning(message):

    def voice_worker():

        try:

            engine = pyttsx3.init()

            engine.setProperty(
                "rate",
                165
            )

            engine.setProperty(
                "volume",
                1.0
            )

            engine.say(message)

            engine.runAndWait()

            engine.stop()

        except Exception as error:

            print(
                "Voice error:",
                error
            )


    thread = threading.Thread(

        target=voice_worker,

        daemon=True
    )

    thread.start()


# =========================================================
# ALERT MANAGER
# =========================================================

def trigger_alert(
    alert_type,
    message
):

    global last_warning_time
    global current_alert


    current_time = time.time()


    current_alert = alert_type


    # Prevent repeated announcements
    if (

        current_time
        -
        last_warning_time

        >=

        WARNING_COOLDOWN
    ):

        speak_warning(message)

        last_warning_time = current_time


# =========================================================
# START SYSTEM
# =========================================================

print()
print("==============================")
print(" DRIVER MONITORING SYSTEM")
print("==============================")
print("Starting camera...")
print()


with FaceLandmarker.create_from_options(
    face_options
) as face_landmarker:


    # =====================================================
    # CAMERA
    # =====================================================

    cap = cv2.VideoCapture(0)


    if not cap.isOpened():

        print(
            "ERROR: Could not open camera."
        )

        exit()


    timestamp_ms = 0


    # =====================================================
    # MAIN LOOP
    # =====================================================

    while True:


        success, frame = cap.read()


        if not success:

            print(
                "ERROR: Could not read frame."
            )

            break


        height, width, _ = frame.shape


        # =================================================
        # RESET CURRENT ALERT
        # =================================================

        current_alert = None


        # =================================================
        # MEDIA PIPE
        # =================================================

        rgb_frame = cv2.cvtColor(

            frame,

            cv2.COLOR_BGR2RGB
        )


        mp_image = mp.Image(

            image_format=mp.ImageFormat.SRGB,

            data=rgb_frame
        )


        face_result = (
            face_landmarker.detect_for_video(
                mp_image,
                timestamp_ms
            )
        )


        timestamp_ms += 33


        # =================================================
        # FACE ANALYSIS
        # =================================================

        if face_result.face_landmarks:


            face = face_result.face_landmarks[0]


            # =============================================
            # EAR
            # =============================================

            left_ear = calculate_ear(

                face,

                LEFT_EYE,

                width,

                height
            )


            right_ear = calculate_ear(

                face,

                RIGHT_EYE,

                width,

                height
            )


            ear = (

                left_ear

                +

                right_ear

            ) / 2.0


            # =============================================
            # EYE STATE
            # =============================================

            if ear < EAR_THRESHOLD:


                if eyes_closed_start is None:

                    eyes_closed_start = time.time()


                closed_duration = (

                    time.time()

                    -

                    eyes_closed_start
                )


                if closed_duration >= DROWSINESS_TIME:

                    trigger_alert(

                        "DROWSINESS",

                        "Warning. Your eyes appear to be closed. Please stay alert."
                    )


            else:

                eyes_closed_start = None


            # =============================================
            # HEAD POSE
            # =============================================

            nose = face[NOSE]

            left_face = face[LEFT_FACE]

            right_face = face[RIGHT_FACE]


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


            if total_distance == 0:

                ratio = 0.5

            else:

                ratio = (

                    left_distance

                    /

                    total_distance
                )


            # =============================================
            # HEAD DIRECTION
            # =============================================

            if ratio < 0.40:

                direction = "RIGHT"

            elif ratio > 0.60:

                direction = "LEFT"

            else:

                direction = "CENTER"


            # =============================================
            # LOOKING AWAY TIMER
            # =============================================

            if direction != "CENTER":


                if looking_away_start is None:

                    looking_away_start = time.time()


                away_duration = (

                    time.time()

                    -

                    looking_away_start
                )


                if away_duration >= LOOK_AWAY_TIME:

                    trigger_alert(

                        "LOOKING_AWAY",

                        "Warning. Please keep your eyes on the road."
                    )


            else:

                looking_away_start = None


            # =============================================
            # DRAW FACE LANDMARKS
            # =============================================

            for index in (
                LEFT_EYE
                +
                RIGHT_EYE
            ):

                landmark = face[index]


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


            # =============================================
            # DRAW HEAD POSE POINTS
            # =============================================

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

                    5,

                    (255, 255, 0),

                    -1
                )


            # =============================================
            # DISPLAY EAR
            # =============================================

            cv2.putText(

                frame,

                f"EAR: {ear:.3f}",

                (30, 35),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.7,

                (255, 255, 255),

                2
            )


            # =============================================
            # DISPLAY HEAD
            # =============================================

            cv2.putText(

                frame,

                f"Head: {direction}",

                (30, 70),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.7,

                (255, 255, 255),

                2
            )


        else:

            eyes_closed_start = None

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


        # =================================================
        # YOLO PHONE DETECTION
        # =================================================

        yolo_results = yolo_model(

            frame,

            verbose=False
        )


        phone_found = False


        for result in yolo_results:


            for box in result.boxes:


                class_id = int(
                    box.cls[0]
                )


                confidence = float(
                    box.conf[0]
                )


                if (

                    class_id
                    ==
                    PHONE_CLASS_ID

                    and

                    confidence
                    >=
                    PHONE_CONFIDENCE
                ):


                    phone_found = True


                    x1, y1, x2, y2 = map(

                        int,

                        box.xyxy[0]
                    )


                    cv2.rectangle(

                        frame,

                        (x1, y1),

                        (x2, y2),

                        (0, 0, 255),

                        3
                    )


                    cv2.putText(

                        frame,

                        f"Cell Phone {confidence:.2f}",

                        (x1, y1 - 10),

                        cv2.FONT_HERSHEY_SIMPLEX,

                        0.7,

                        (0, 0, 255),

                        2
                    )


        # =================================================
        # PHONE TIMER
        # =================================================

        if phone_found:


            if phone_detected_start is None:

                phone_detected_start = time.time()


            phone_duration = (

                time.time()

                -

                phone_detected_start
            )


            if phone_duration >= PHONE_DETECTION_TIME:

                trigger_alert(

                    "PHONE",

                    "Warning. Mobile phone usage detected. Please focus on driving."
                )


        else:

            phone_detected_start = None


        # =================================================
        # FINAL STATUS
        # =================================================

        if current_alert == "DROWSINESS":

            status_text = "DROWSINESS DETECTED"

            status_color = (0, 0, 255)


        elif current_alert == "LOOKING_AWAY":

            status_text = "DISTRACTION: LOOKING AWAY"

            status_color = (0, 0, 255)


        elif current_alert == "PHONE":

            status_text = "DISTRACTION: PHONE"

            status_color = (0, 0, 255)


        else:

            status_text = "STATUS: NORMAL"

            status_color = (0, 255, 0)


        # =================================================
        # STATUS ON SCREEN
        # =================================================

        cv2.putText(

            frame,

            status_text,

            (30, height - 50),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.8,

            status_color,

            3
        )


        # =================================================
        # DISPLAY
        # =================================================

        cv2.imshow(

            "AI Driver Monitoring System",

            frame
        )


        # =================================================
        # QUIT
        # =================================================

        if (

            cv2.waitKey(1) & 0xFF

            ==

            ord("q")
        ):

            break


    # =====================================================
    # CLEANUP
    # =====================================================

    cap.release()


cv2.destroyAllWindows()


print()
print("Driver Monitoring System stopped.")