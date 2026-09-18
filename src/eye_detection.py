import cv2
import mediapipe as mp


MODEL_PATH = "models/face_landmarker.task"


# MediaPipe setup
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


# Start detector
with FaceLandmarker.create_from_options(options) as landmarker:

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("ERROR: Could not open camera.")
        exit()

    timestamp_ms = 0

    while True:

        success, frame = cap.read()

        if not success:
            print("ERROR: Could not read frame.")
            break

        # BGR -> RGB
        rgb_frame = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        # MediaPipe image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb_frame
        )

        # Detect landmarks
        result = landmarker.detect_for_video(
            mp_image,
            timestamp_ms
        )

        timestamp_ms += 33

        # ---------------------------------
        # Draw eye landmarks
        # ---------------------------------

        if result.face_landmarks:

            for face_landmarks in result.face_landmarks:

                height, width, _ = frame.shape

                # Left eye landmarks
                left_eye = [
                    33,
                    133,
                    160,
                    159,
                    158,
                    157,
                    173
                ]

                # Right eye landmarks
                right_eye = [
                    362,
                    263,
                    387,
                    386,
                    385,
                    384,
                    398
                ]

                # Draw left eye
                for index in left_eye:

                    landmark = face_landmarks[index]

                    x = int(landmark.x * width)
                    y = int(landmark.y * height)

                    cv2.circle(
                        frame,
                        (x, y),
                        4,
                        (0, 255, 255),
                        -1
                    )

                # Draw right eye
                for index in right_eye:

                    landmark = face_landmarks[index]

                    x = int(landmark.x * width)
                    y = int(landmark.y * height)

                    cv2.circle(
                        frame,
                        (x, y),
                        4,
                        (0, 255, 255),
                        -1
                    )

        cv2.imshow(
            "Driver Eye Detection",
            frame
        )

        # Press Q
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()

cv2.destroyAllWindows()