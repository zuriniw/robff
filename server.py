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

@app.route("/")
def hello():
    return render_template("index.html")

@app.route("/motors/<left>,<right>")
def motors(left, right):
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

# Button control routes
@app.route("/move_forward")
def move_forward():
    robot_control.move_forward()
    return ""

@app.route("/move_backward")
def move_backward():
    robot_control.move_backward()
    return ""

@app.route("/stop_movement")
def stop_movement():
    robot_control.stop_movement()
    return ""

@app.route("/rotate_left")
def rotate_left():
    robot_control.rotate_left_continuous()
    return ""

@app.route("/rotate_right")
def rotate_right():
    robot_control.rotate_right_continuous()
    return ""

@app.route("/rotate_left_45")
def rotate_left_45():
    robot_control.rotate_left_45()
    return ""

@app.route("/rotate_left_90")
def rotate_left_90():
    robot_control.rotate_left_90()
    return ""

@app.route("/rotate_right_45")
def rotate_right_45():
    robot_control.rotate_right_45()
    return ""

@app.route("/rotate_right_90")
def rotate_right_90():
    robot_control.rotate_right_90()
    return ""

@app.route("/rotate_180")
def rotate_180():
    robot_control.rotate_180()
    return ""

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


# ========== SERVO POSITION CONTROL ROUTES ==========

@app.route("/servo/enable")
def servo_enable():
    """Enable servo control"""
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
    a_star.servo_home()
    return ""

@app.route("/servo/hold")
def servo_hold():
    """Move to hold position (mid, flat, close)"""
    a_star.servo_hold()
    return ""

@app.route("/servo/lift")
def servo_lift():
    """Move to lift position (up, up, close)"""
    a_star.servo_lift()
    return ""

@app.route("/servo/grip")
def servo_grip():
    """Move to grip position (down, down, close)"""
    a_star.servo_grip()
    return ""

@app.route("/servo/capture")
def servo_capture():
    """Move to capture position (down, down, open)"""
    a_star.servo_capture()
    return ""

@app.route("/servo/park")
def servo_park():
    """Park servos (home then disable)"""
    a_star.servo_park()
    return ""

# Also update the status.json route to include servo info:
@app.route("/status.json")
def status():
    buttons = a_star.read_buttons()
    analog = a_star.read_analog()
    battery_millivolts = a_star.read_battery_millivolts()
    encoders = a_star.read_encoders()
    
    # Add servo status
    servo_status = a_star.read_servo_status()
    
    data = {
        "buttons": buttons,
        "battery_millivolts": battery_millivolts,
        "analog": analog,
        "encoders": encoders,
        "speed_level": current_speed,
        "servo_status": servo_status
    }
    return json.dumps(data)

if __name__ == "__main__":
    app.run(host = "0.0.0.0")
