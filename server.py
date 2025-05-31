#!/usr/bin/env python3

# Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
from flask import Flask
from flask import render_template
from flask import redirect
from subprocess import call
app = Flask(__name__)
app.debug = True

from a_star import AStar
a_star = AStar()

# Import the robot button control module
from utilities.robot_buttom import RobotButtonControl
robot_control = RobotButtonControl(a_star)

# Import recording module
from utilities.recording import RecordingControl
recording_control = RecordingControl()

import json

led0_state = False
led1_state = False
led2_state = False
current_speed = "fast"  # Default speed level
paused = False  # Global pause state

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
        
    # Apply speed factor to motor commands from joystick
    if current_speed == "slow":
        factor = robot_control.SPEED_SLOW
    elif current_speed == "moderate":
        factor = robot_control.SPEED_MODERATE
    else:
        factor = robot_control.SPEED_FAST
        
    left_adjusted = int(int(left) * factor)
    right_adjusted = int(int(right) * factor)
    robot_control.motors(left_adjusted, right_adjusted)
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

@app.route("/start_recording")
def start_recording():
    recording_control.start_recording()
    return ""

@app.route("/stop_recording")
def stop_recording():
    recording_control.stop_recording()
    return ""

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

# ========== STATUS REPORTING WITH PAUSE STATE ==========

@app.route("/status.json")
def status():
    buttons = a_star.read_buttons()
    analog = a_star.read_analog()
    battery_millivolts = a_star.read_battery_millivolts()
    encoders = a_star.read_encoders()
    servo_status = a_star.read_servo_status()
    servo_pwm = a_star.servo_get_pwm_values()
    
    data = {
        "buttons": buttons,
        "battery_millivolts": battery_millivolts,
        "analog": analog,
        "encoders": encoders,
        "speed_level": current_speed,
        "servo_status": servo_status,
        "servo_pwm": servo_pwm,
        "paused": paused  # Add pause state to status
    }
    return json.dumps(data)

if __name__ == "__main__":
    app.run(host = "0.0.0.0")