#!/usr/bin/env python3

from time import sleep
import threading
import math

class RobotButtonControl:
    # 原有浮点乘数速度常量（用于乘法控制）
    SPEED_SLOW = 0.3
    SPEED_MODERATE = 0.5
    SPEED_FAST = 0.9

    # 每档速度下的固定PWM值（用于按钮控制行为）
    HARD_CODED_SPEEDS = {
        "slow": {
            "forward": (75, 10), "backward": (-70, -10),
            "rotate_left": (-50, 50), "rotate_right": (50, -50)
        },
        "moderate": {
            "forward": (92, 75), "backward": (-92, -65),
            "rotate_left": (-90, 90), "rotate_right": (90, -90)
        },
        "fast": {
            "forward": (230, 233), "backward": (-238, -230),
            "rotate_left": (-100, 100), "rotate_right": (100, -100)
        }
    }

    # 右轮速度修正因子（默认不修正）
    RIGHT_WHEEL_CORRECTION = 1

    def __init__(self, a_star):
        self.a_star = a_star
        self.is_moving = False
        self.speed_level = "fast"

    def set_speed(self, speed_level):
        if speed_level in self.HARD_CODED_SPEEDS:
            self.speed_level = speed_level
        return self.speed_level

    def motors(self, left, right):
        right_corrected = int(right * self.RIGHT_WHEEL_CORRECTION)

        MIN_MOTOR_THRESHOLD = 60
        if left != 0 and abs(left) < MIN_MOTOR_THRESHOLD:
            left = MIN_MOTOR_THRESHOLD if left > 0 else -MIN_MOTOR_THRESHOLD
        if right_corrected != 0 and abs(right_corrected) < MIN_MOTOR_THRESHOLD:
            right_corrected = MIN_MOTOR_THRESHOLD if right_corrected > 0 else -MIN_MOTOR_THRESHOLD

        self.a_star.motors(left, right_corrected)

    def move_forward(self):
        left, right = self.HARD_CODED_SPEEDS[self.speed_level]["forward"]
        self.motors(left, right)
        self.is_moving = True

    def move_backward(self):
        left, right = self.HARD_CODED_SPEEDS[self.speed_level]["backward"]
        self.motors(left, right)
        self.is_moving = True

    def stop_movement(self):
        self.motors(0, 0)
        self.is_moving = False

    def rotate_left_continuous(self):
        left, right = self.HARD_CODED_SPEEDS[self.speed_level]["rotate_left"]
        self.motors(left, right)
        self.is_moving = True

    def rotate_right_continuous(self):
        left, right = self.HARD_CODED_SPEEDS[self.speed_level]["rotate_right"]
        self.motors(left, right)
        self.is_moving = True

    def _rotate(self, angle):
        self.stop_movement()

        if angle > 0:
            left, right = self.HARD_CODED_SPEEDS[self.speed_level]["rotate_right"]
        else:
            left, right = self.HARD_CODED_SPEEDS[self.speed_level]["rotate_left"]

        base_duration = abs(angle) / 90.0 * 0.5
        duration = base_duration

        self.motors(left, right)
        sleep(duration)
        self.stop_movement()

    def rotate_left_45(self):
        self._rotate(-45)

    def rotate_left_90(self):
        self._rotate(-90)

    def rotate_right_45(self):
        self._rotate(45)

    def rotate_right_90(self):
        self._rotate(90)

    def rotate_180(self):
        self._rotate(180)
