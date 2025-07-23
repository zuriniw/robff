#!/usr/bin/env python3

# Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
from flask import Flask, request, jsonify
from flask import render_template
from flask import redirect
from subprocess import call
app = Flask(__name__)
app.debug = True

from a_star import AStar
a_star = AStar()

# Import the robot button control module
from utilities.robot_button import RobotButtonControl
robot_control = RobotButtonControl(a_star)

# Import enhanced recording module with ReSpeaker support
from utilities.recording import RecordingControl_v3
recording_control = RecordingControl_v3()  # IP permanently set to 172.20.10.4

import json

led0_state = False
led1_state = False
led2_state = False
current_speed = "moderate"  # Default speed level
paused = False  # Global pause state

##########################
import cv2
import time
from flask import Response

def generate_video():
    cap = cv2.VideoCapture('/dev/front_cam')
    # cap = cv2.VideoCapture('/dev/rear_cam')

    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 15)
    
    if not cap.isOpened():
        print("Error: Unable to open /dev/front_cam")
        return
    
    while True:
        for _ in range(2):  # 丢掉缓存帧
            cap.read()

        success, frame = cap.read()
        if not success:
            print("Warning: Failed to read frame, retrying...")
            time.sleep(0.1)
            continue

        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    """MJPEG HTTP stream from /dev/video1"""
    return Response(generate_video(), mimetype='multipart/x-mixed-replace; boundary=frame')

###############################
@app.route("/")
def hello():
    return render_template("index.html")

# ========== PAUSE/RESUME CONTROL ==========

@app.route("/pause")
def set_pause():
    global paused
    paused = True
    a_star.motors(0, 0)  # 立即停止电机
    a_star.servo_disable()  # 禁用伺服器
    return ""

@app.route("/resume") 
def set_resume():
    global paused
    paused = False
    return ""

# ========== MOTOR CONTROL WITH PAUSE CHECK ==========

@app.route("/motors/<left>,<right>")
def motors(left, right):
    # If paused, force motors to stop
    if paused:
        left, right = 0, 0
    
    # 直接使用传入的值，不应用任何速度因子
    robot_control.motors(int(left), int(right))
    return ""

@app.route("/set_speed/<level>")
def set_speed(level):
    global current_speed
    if level in ["slow", "moderate", "fast"]:
        current_speed = level
        robot_control.set_speed(level)
    return ""

# ========== MOVEMENT CONTROL WITH PAUSE CHECK ==========

@app.route("/move_forward")
def move_forward():
    if not paused:
        robot_control.move_forward()
    return ""

@app.route("/move_backward")
def move_backward():
    if not paused:
        robot_control.move_backward()
    return ""

@app.route("/stop_movement")
def stop_movement():
    robot_control.stop_movement()
    return ""

@app.route("/rotate_left")
def rotate_left():
    if not paused:
        robot_control.rotate_left_continuous()
    return ""

@app.route("/rotate_right")
def rotate_right():
    if not paused:
        robot_control.rotate_right_continuous()
    return ""

@app.route("/rotate_left_45")
def rotate_left_45():
    if not paused:
        robot_control.rotate_left_45()
    return ""

@app.route("/rotate_left_90")
def rotate_left_90():
    if not paused:
        robot_control.rotate_left_90()
    return ""

@app.route("/rotate_right_45")
def rotate_right_45():
    if not paused:
        robot_control.rotate_right_45()
    return ""

@app.route("/rotate_right_90")
def rotate_right_90():
    if not paused:
        robot_control.rotate_right_90()
    return ""

@app.route("/rotate_180")
def rotate_180():
    if not paused:
        robot_control.rotate_180()
    return ""

# ========== LED AND BUZZER CONTROL (NOT AFFECTED BY PAUSE) ==========

@app.route("/leds/<int:led0>,<int:led1>,<int:led2>")
def leds(led0, led1, led2):
    a_star.leds(led0, led1, led2)
    global led0_state
    global led1_state
    global led2_state
    led0_state = led0
    led1_state = led1
    led2_state = led2
    return ""

@app.route("/heartbeat/<int:state>")
def hearbeat(state):
    if state == 0:
      a_star.leds(led0_state, led1_state, led2_state)
    else:
        a_star.leds(not led0_state, not led1_state, not led2_state)
    return ""

@app.route("/play_notes/<notes>")
def play_notes(notes):
    a_star.play_notes(notes)
    return ""

# ========== SYSTEM CONTROL ==========

@app.route("/halt")
def halt():
    call(["bash", "-c", "(sleep 2; sudo halt)&"])
    return redirect("/shutting-down")

@app.route("/shutting-down")
def shutting_down():
    return "Shutting down in 2 seconds! You can remove power when the green LED stops flashing."

# ========== ENHANCED RECORDING CONTROL WITH RESPEAKER ==========

@app.route("/start_recording")
def start_recording():
    success = recording_control.start_recording()
    return json.dumps({"success": success})

@app.route("/stop_recording")
def stop_recording():
    success = recording_control.stop_recording()
    return json.dumps({"success": success})


@app.route("/set_user_id", methods=['POST'])
def set_user_id():
    """Set user ID for file naming"""
    try:
        data = request.get_json()
        if not data:
            return json.dumps({"success": False, "message": "No data received"})
        
        user_id = data.get('user_id', '').strip()
        
        if not user_id:
            return json.dumps({"success": False, "message": "User ID cannot be empty"})
        
        # Validate user ID format
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', user_id):
            return json.dumps({"success": False, "message": "Invalid format"})
        
        # Set user ID
        if recording_control.set_user_id(user_id):
            return json.dumps({
                "success": True, 
                "message": f"User ID set to {recording_control.user_id}",
                "user_id": recording_control.user_id
            })
        else:
            return json.dumps({"success": False, "message": "Failed to set user ID"})
            
    except Exception as e:
        return json.dumps({"success": False, "message": f"Server error: {str(e)}"})


# ========== SERVO POSITION CONTROL WITH PAUSE CHECK ==========

@app.route("/servo/enable")
def servo_enable():
    """Enable servo control"""
    if not paused:
        a_star.servo_enable(True)
    return ""

@app.route("/servo/disable") 
def servo_disable():
    """Disable servo control"""
    a_star.servo_disable()
    return ""

@app.route("/servo/home")
def servo_home():
    """Move to home position (mid, flat, open)"""
    if not paused:
        a_star.servo_home()
    return ""

@app.route("/servo/hold")
def servo_hold():
    """Move to hold position (mid, flat, close)"""
    if not paused:
        a_star.servo_hold()
    return ""

@app.route("/servo/lift")
def servo_lift():
    """Move to lift position (up, up, close)"""
    if not paused:
        a_star.servo_lift()
    return ""

@app.route("/servo/grip")
def servo_grip():
    """Move to grip position (down, down, close)"""
    if not paused:
        a_star.servo_grip()
    return ""

@app.route("/servo/capture")
def servo_capture():
    """Move to capture position (down, down, open)"""
    if not paused:
        a_star.servo_capture()
    return ""

@app.route("/servo/park")
def servo_park():
    """Park servos (home then disable)"""
    if not paused:
        a_star.servo_park()
    return ""

@app.route("/servo/pwm/<servo>/<int:value>")
def servo_set_pwm(servo, value):
    """设置单个servo的PWM值"""
    if not paused:
        if servo == "lift":
            a_star.servo_set_lift_pwm(value)
        elif servo == "tilt":
            a_star.servo_set_tilt_pwm(value)
        elif servo == "gripper":
            a_star.servo_set_gripper_pwm(value)
        else:
            return "Invalid servo name", 400
    return ""

@app.route("/servo/pwm_values.json")
def get_servo_pwm_values():
    """get current pwm values for all servos"""
    pwm_values = a_star.servo_get_pwm_values()
    return json.dumps(pwm_values)


# ========== STATUS REPORTING WITH ENHANCED RECORDING INFO ==========

@app.route("/test_user_id")
def test_user_id():
    """测试用户ID的当前状态"""
    info = {
        "current_user_id": recording_control.user_id,
        "object_id": id(recording_control),
        "class_name": recording_control.__class__.__name__,
        "module_name": recording_control.__class__.__module__
    }
    print(f"TEST: {info}")
    return json.dumps(info, indent=2)

@app.route("/force_set_user_id/<user_id>")
def force_set_user_id(user_id):
    """强制设置用户ID用于测试"""
    old_id = recording_control.user_id
    recording_control.user_id = user_id  # 直接设置
    new_id = recording_control.user_id
    
    result = {
        "old_id": old_id,
        "new_id": new_id,
        "success": new_id == user_id
    }
    print(f"FORCE SET: {result}")
    return json.dumps(result, indent=2)

@app.route("/status.json")
def status():
    buttons = a_star.read_buttons()
    analog = a_star.read_analog()
    battery_millivolts = a_star.read_battery_millivolts()
    encoders = a_star.read_encoders()
    servo_status = a_star.read_servo_status()
    servo_pwm = a_star.servo_get_pwm_values()
    
    # Get recording status
    recording_status = recording_control.get_recording_status()
    
    data = {
        "buttons": buttons,
        "battery_millivolts": battery_millivolts,
        "analog": analog,
        "encoders": encoders,
        "speed_level": current_speed,
        "servo_status": servo_status,
        "servo_pwm": servo_pwm,
        "paused": paused,
        "recording": recording_status,
        "user_id": recording_control.user_id
    }
    return json.dumps(data)

if __name__ == "__main__":
    app.run(host = "0.0.0.0")