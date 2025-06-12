#!/usr/bin/env python3

from time import sleep
import threading
import math

class RobotButtonControl:
    SPEED_SLOW = 0.3
    SPEED_MODERATE = 0.5
    SPEED_FAST = 0.9
    
    # 右轮速度修正因子 (降低到左轮的68%)
    RIGHT_WHEEL_CORRECTION = 0.69
    
    def __init__(self, a_star):
        """Initialize the robot button control module"""
        self.a_star = a_star
        self.is_moving = False
        self.speed_factor = self.SPEED_FAST  # Default to fast speed
        self.base_speed = 200
        self.rotation_speed = 150
    
    def set_speed(self, speed_level):
        """Set the speed level (slow, moderate, fast)"""
        if speed_level == "slow":
            self.speed_factor = self.SPEED_SLOW
        elif speed_level == "moderate":
            self.speed_factor = self.SPEED_MODERATE
        else:  # Default to fast
            self.speed_factor = self.SPEED_FAST
        return self.speed_factor
    
    def motors(self, left, right):
        """Apply wheel correction and send commands to motors"""
        # 应用右轮修正因子
        right_corrected = int(right * self.RIGHT_WHEEL_CORRECTION)
        
        # 应用最小启动阈值，避免电机值太小无法启动
        MIN_MOTOR_THRESHOLD = 60
        
        # 对于非零值，确保达到最小阈值
        if left != 0:
            if abs(left) < MIN_MOTOR_THRESHOLD:
                left = MIN_MOTOR_THRESHOLD if left > 0 else -MIN_MOTOR_THRESHOLD
                
        if right_corrected != 0:
            if abs(right_corrected) < MIN_MOTOR_THRESHOLD:
                right_corrected = MIN_MOTOR_THRESHOLD if right_corrected > 0 else -MIN_MOTOR_THRESHOLD
        
        self.a_star.motors(left, right_corrected)
    
    def move_forward(self):
        """Start moving forward - continuous movement while pressed"""
        speed = int(self.base_speed * self.speed_factor)
        self.motors(speed, speed)
        self.is_moving = True
    
    def move_backward(self):
        """Start moving backward - continuous movement while pressed"""
        speed = int(self.base_speed * self.speed_factor)
        self.motors(-speed, -speed)
        self.is_moving = True
    
    def stop_movement(self):
        """Stop all movement"""
        self.motors(0, 0)
        self.is_moving = False
        
    def rotate_left_continuous(self):
        """Start rotating left - continuous rotation while pressed"""
        speed = int(self.rotation_speed * self.speed_factor)
        self.motors(-speed, speed)
        self.is_moving = True
    
    def rotate_right_continuous(self):
        """Start rotating right - continuous rotation while pressed"""
        speed = int(self.rotation_speed * self.speed_factor)
        self.motors(speed, -speed)
        self.is_moving = True
        
    def _rotate(self, angle, speed=None):
        """Internal function to rotate the robot by a specific angle
            
        Args:
            angle (float): Angle in degrees to rotate. Positive for right, negative for left.
            speed (int): Motor speed for rotation
        """
        # Stop any existing movement
        self.stop_movement()
                
        # Use the rotation speed with speed factor applied
        if speed is None:
            speed = int(self.rotation_speed * self.speed_factor)
                
        # Calculate rotation duration - further calibrated based on slow speed test
        base_duration = abs(angle) / 90.0 * 0.5  # Increased from 0.5 to 0.9
        duration = base_duration / self.speed_factor
                
        # Set motor directions based on rotation direction
        if angle > 0:  # Right turn
            self.motors(-speed, speed)
        else:  # Left turn
            self.motors(speed, -speed)
                
        # Wait for the duration
        sleep(duration)
                
        # Stop after rotation
        self.stop_movement()

    def rotate_left_45(self):
        """Rotate left 45 degrees - one-time operation"""
        self._rotate(-45)
    
    def rotate_left_90(self):
        """Rotate left 90 degrees - one-time operation"""
        self._rotate(-90)
    
    def rotate_right_45(self):
        """Rotate right 45 degrees - one-time operation"""
        self._rotate(45)
    
    def rotate_right_90(self):
        """Rotate right 90 degrees - one-time operation"""
        self._rotate(90)
    
    def rotate_180(self):
        """Rotate 180 degrees - one-time operation"""
        self._rotate(180) 