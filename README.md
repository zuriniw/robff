# Romi Robot with Servo Arm Control

A Raspberry Pi-controlled Romi robot with robotic arm capabilities using I2C communication.

## Quick Start

### Hardware Testing (Arduino Only)

Test the servo arm independently before full integration:

1. Upload `overall_test_servos.ino` to Arduino board
2. Open Serial Monitor (9600 baud)
3. Use keyboard commands to control the robotic arm:
   - `home` - Move to safe home position
   - `capture` - Position for grabbing objects
   - `grip` - Close gripper on object
   - `lift` - Lift object up
   - `park` - Return to park position

### Full System (Raspberry Pi + Arduino)

Run the complete robot control system:

1. **Arduino Setup:**
   - Upload `arduino_slave.ino` to Arduino board

2. **Raspberry Pi Setup:**
   - Ensure SSH and I2C are enabled
   - Run `python3 server.py`

3. **Access Control Panel:**
   - Visit `http://172.20.10.10:5000/` in your browser
   - Control both chassis movement and servo arm

![Control Panel](https://raw.githubusercontent.com/zzww-code/what/master/202505301820045.png)

## Architecture

```
Web Interface → Flask Server → I2C Communication → Arduino → Hardware
```

### File Structure

**Arduino Code** (`arduino/` folder):
- `overall_test_servos.ino` - Standalone servo testing
- `arduino_slave.ino` - I2C slave for full system

**Raspberry Pi Code** (root folder):
- `a_star.py` - I2C communication interface
- `server.py` - Flask web server
- `static/`, `templates/` - Web UI files  
- `utilities/` - Modularized robot features

## Features

- **Chassis Control:** Tank-style movement with speed control
- **Servo Arm:** 5-position robotic arm (home, capture, grip, lift, park)
- **Web Interface:** Real-time control and status monitoring
- **Dual Mode:** Hardware testing + full system integration

## Hardware Requirements

- Romi 32U4 Control Board
- Raspberry Pi (with I2C enabled)
- 3-servo robotic arm (lift, tilt, gripper)
- Power supply for servos