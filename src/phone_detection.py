import cv2
import time
import threading
import pyttsx3
from ultralytics import YOLO


# ==========================================
# Configuration
# ==========================================

MODEL_PATH = "yolo11n.pt"

# YOLO confidence threshold
CONFIDENCE_THRESHOLD = 0.50

# Phone must remain detected this long
# before distraction is confirmed
PHONE_DETECTION_TIME = 1.5

# Minimum time between voice warnings
WARNING_COOLDOWN = 5.0


# ==========================================
# Voice Alert
# ==========================================

def speak_warning(message):
    """
    Speak the warning in a background thread
    so the camera does not freeze.
    """

    def voice_worker():

        engine = pyttsx3.init()

        # JARVIS-inspired speaking speed
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
# Load YOLO model
# ==========================================

print("Loading YOLO model...")

model = YOLO(MODEL_PATH)

print("YOLO model loaded successfully.")


# ==========================================
# Find cell phone class
# ==========================================

# COCO class ID for cell phone = 67
PHONE_CLASS_ID = 67


# ==========================================
# Phone detection state
# ==========================================

phone_detected_start = None

last_warning_time = 0

phone_distraction = False


# ==========================================
# Start webcam
# ==========================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():

    print("ERROR: Could not open camera.")
    exit()


# ==========================================
# Main camera loop
# ==========================================

while True:

    success, frame = cap.read()

    if not success:

        print("ERROR: Could not read frame.")
        break


    # ======================================
    # YOLO detection
    # ======================================

    results = model(
        frame,
        verbose=False
    )


    phone_found = False


    # ======================================
    # Process detections
    # ======================================

    for result in results:

        boxes = result.boxes

        for box in boxes:

            # Class ID
            class_id = int(
                box.cls[0]
            )

            # Confidence
            confidence = float(
                box.conf[0]
            )


            # Only process cell phone
            if (
                class_id == PHONE_CLASS_ID
                and confidence >= CONFIDENCE_THRESHOLD
            ):

                phone_found = True


                # ----------------------------------
                # Bounding box
                # ----------------------------------

                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0]
                )


                # ----------------------------------
                # Draw bounding box
                # ----------------------------------

                cv2.rectangle(
                    frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 0, 255),
                    3
                )


                # ----------------------------------
                # Detection label
                # ----------------------------------

                label = (
                    f"Cell Phone "
                    f"{confidence:.2f}"
                )


                cv2.putText(
                    frame,
                    label,
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 0, 255),
                    2
                )


    # ======================================
    # Phone detected
    # ======================================

    if phone_found:

        # Start timer
        if phone_detected_start is None:

            phone_detected_start = time.time()


        # Calculate duration
        phone_duration = (
            time.time()
            -
            phone_detected_start
        )


        # ==================================
        # Confirm distraction
        # ==================================

        if phone_duration >= PHONE_DETECTION_TIME:

            phone_distraction = True


            current_time = time.time()


            # ----------------------------------
            # Voice warning cooldown
            # ----------------------------------

            if (
                current_time
                -
                last_warning_time
                >= WARNING_COOLDOWN
            ):

                speak_warning(
                    "Warning. Mobile phone usage detected. Please focus on driving."
                )

                last_warning_time = current_time


    else:

        # Phone disappeared
        phone_detected_start = None

        phone_distraction = False


    # ======================================
    # Display phone duration
    # ======================================

    if phone_detected_start is not None:

        phone_duration = (
            time.time()
            -
            phone_detected_start
        )

        cv2.putText(
            frame,
            f"Phone detected: {phone_duration:.1f}s",
            (30, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 255),
            2
        )


    # ======================================
    # Display distraction status
    # ======================================

    if phone_distraction:

        cv2.putText(
            frame,
            "PHONE DISTRACTION DETECTED!",
            (30, 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 255),
            3
        )

        cv2.putText(
            frame,
            "PLEASE FOCUS ON DRIVING",
            (30, 130),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 255),
            2
        )

    else:

        cv2.putText(
            frame,
            "STATUS: NORMAL",
            (30, 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2
        )


    # ======================================
    # Display camera
    # ======================================

    cv2.imshow(
        "Driver Phone Detection",
        frame
    )


    # ======================================
    # Quit
    # ======================================

    if (
        cv2.waitKey(1) & 0xFF
        == ord("q")
    ):

        break


# ==========================================
# Cleanup
# ==========================================

cap.release()

cv2.destroyAllWindows()