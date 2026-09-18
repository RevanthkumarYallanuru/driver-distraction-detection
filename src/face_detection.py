import cv2
import mediapipe as mp


# -----------------------------
# Configuration
# -----------------------------

MODEL_PATH = "models/face_landmarker.task"


# -----------------------------
# Create MediaPipe Face Landmarker
# -----------------------------

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode


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


# -----------------------------
# Start webcam
# -----------------------------

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("ERROR: Could not open camera.")
    exit()


# Timestamp required by MediaPipe VIDEO mode
timestamp_ms = 0


# -----------------------------
# Run Face Landmarker
# -----------------------------

with FaceLandmarker.create_from_options(options) as landmarker:

    while True:

        success, frame = cap.read()

        if not success:
            print("ERROR: Could not read camera frame.")
            break

        # OpenCV uses BGR
        # MediaPipe expects RGB
        rgb_frame = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        # Convert NumPy image to MediaPipe image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb_frame
        )

        # Detect face landmarks
        result = landmarker.detect_for_video(
            mp_image,
            timestamp_ms
        )

        timestamp_ms += 33


        # -----------------------------
        # Draw face landmarks
        # -----------------------------

        if result.face_landmarks:

            for face_landmarks in result.face_landmarks:

                height, width, _ = frame.shape

                for landmark in face_landmarks:

                    x = int(landmark.x * width)
                    y = int(landmark.y * height)

                    cv2.circle(
                        frame,
                        (x, y),
                        1,
                        (0, 255, 0),
                        -1
                    )


        # Display result
        cv2.imshow(
            "Driver Face Landmarks",
            frame
        )


        # Press Q to quit
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break


# -----------------------------
# Cleanup
# -----------------------------

cap.release()
cv2.destroyAllWindows()