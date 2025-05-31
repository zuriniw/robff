# Romi Robot with Arm Control

A Flask-based web interface for controlling a Romi robot with integrated servo arm system and recording capabilities.

## Features

### Robot Movement
- Tank-style drive system with speed control (slow/moderate/fast)
- Right wheel correction (64% reduction) for straight movement
- Minimum motor threshold (60) to prevent stalling
- Multiple control methods:
  - Virtual joystick with visual guides
  - Direction buttons (↑,↓,←,→)
  - Keyboard controls (WASD)

### Robotic Arm
- 3-servo system with PWM control:
  - Lift servo (1000-1900μs)
  - Tilt servo (1210-1890μs)
  - Gripper servo (500-2330μs)
- Visual slider controls with live feedback
- Preset positions:
  - Home (mid, flat, open)
  - Hold (mid, flat, close)
  - Lift (up, up, close)
  - Grip (down, down, close) 
  - Capture (down, down, open)
  - Park (home then disable)

### Recording System
- Version 1:
  - Separate video (MP4) and audio (WAV) files
  - Known issue: 2s video delay from audio
- Version 2 (Recommended):
  - Combined MP4 output with synchronized audio/video
  - First 0.8s of audio trimmed for sync
  - H264 video encoding with AAC audio
  - Quality settings:
    - Video: 1080p@30fps, 5Mbps
    - Audio: 44.1kHz, 16-bit stereo, 192k AAC

To switch between versions, modify in server.py:

```python
# For Version 1
from utilities.recording import RecordingControl_v1 as RecordingControl

# For Version 2 (Recommended)
from utilities.recording import RecordingControl_v2 as RecordingControl
```

### Additional Features
- System pause/resume functionality
- LED control interface
- Musical note playback
- Real-time sensor readings:
  - Button states
  - Battery voltage
  - Analog inputs
  - Motor encoders
  - Servo status

## Architecture

```
Web Interface (HTML/CSS/JS)
      ↓
Flask Server (Python)
      ↓
I2C Communication (AStar)
      ↓
Arduino Controller
      ↓
Hardware (Motors/Servos)
```

## Setup Instructions

### Hardware Requirements
- Romi 32U4 Control Board
- Raspberry Pi (I2C enabled)
- 3-Servo Robotic Arm:
  - Lift: Pin 21
  - Tilt: Pin 22
  - Gripper: Pin 11
- Pi Camera Module (for recording)
- USB Audio Device

### Software Setup

1. **Arduino Setup**
```bash
# Upload arduino_slave.ino to Romi board
```

2. **Raspberry Pi Setup**
```bash
# Install dependencies
sudo apt-get install python3-flask python3-smbus

# Start server
python3 server.py
```

3. **Access Control Panel**
```
http://[RPI_IP]:5000/
```

## File Structure

```
├── arduino/
│   ├── arduino_slave.ino      # Main Arduino controller
│   └── overall_test_servos.ino # Standalone servo tester
├── static/
│   ├── main.css              # UI styling
│   └── script.js             # Frontend logic
├── templates/
│   └── index.html            # Web interface
├── utilities/
│   ├── robot_buttom.py       # Robot movement control
│   └── recording.py          # Audio/video recording
├── a_star.py                 # I2C communication
└── server.py                 # Flask server
```

## Contributing

Please ensure any pull requests follow the existing code structure and include appropriate documentation.

## License

Copyright Pololu Corporation. For more information, see https://www.pololu.com/