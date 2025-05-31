#!/usr/bin/env python3

import subprocess
import os
from datetime import datetime
import signal

class RecordingControl_v1:
    def __init__(self):
        self.recording_dir = "/home/robff/robff/recordings"
        self.video_process = None
        self.audio_process = None
        self.is_recording = False
        
        # Create recording directory if it doesn't exist
        os.makedirs(self.recording_dir, exist_ok=True)
    
    def start_recording(self):
        if self.is_recording:
            return
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        h264_file = os.path.join(self.recording_dir, f"video_{timestamp}.h264")
        self.current_h264_file = h264_file
        self.current_timestamp = timestamp
        audio_file = os.path.join(self.recording_dir, f"audio_{timestamp}.wav")
        
        try:
            # Record in H264 format
            self.video_process = subprocess.Popen([
                "libcamera-vid", "-t", "0", "-o", h264_file,
                "--width", "1920", "--height", "1080", "--framerate", "30",
                "--codec", "h264"
            ])
            
            # Audio recording remains the same
            self.audio_process = subprocess.Popen([
                "arecord", "-D", "plughw:3,0", "-f", "cd", "-t", "wav", audio_file
            ])
            
            self.is_recording = True
            print(f"Recording started: {h264_file}, {audio_file}")
            
        except Exception as e:
            print(f"Failed to start recording: {e}")
            self.stop_recording()

    def stop_recording(self):
        if not self.is_recording:
            return
            
        try:
            if self.video_process:
                self.video_process.terminate()
                self.video_process.wait()
                self.video_process = None
                
                # Convert H264 to MP4
                mp4_file = os.path.join(self.recording_dir, f"video_{self.current_timestamp}.mp4")
                subprocess.run([
                    "ffmpeg", "-i", self.current_h264_file, "-c", "copy", mp4_file
                ])
                # Optionally remove the H264 file
                os.remove(self.current_h264_file)
                
            if self.audio_process:
                self.audio_process.terminate()
                self.audio_process.wait()
                self.audio_process = None
                
            self.is_recording = False
            print("Recording stopped and converted to MP4")
            
        except Exception as e:
            print(f"Error stopping recording: {e}")



import subprocess
import os
import signal
import time
from datetime import datetime
import threading

class RecordingControl_v2:
    def __init__(self):
        self.recording_dir = "/home/robff/robff/recordings"
        self.video_process = None
        self.audio_process = None
        self.is_recording = False
        
        # Create recording directory if it doesn't exist
        os.makedirs(self.recording_dir, exist_ok=True)
    
    def start_recording(self):
        if self.is_recording:
            return
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 使用 h264 格式避免 MP4 的问题
        self.h264_file = os.path.join(self.recording_dir, f"video_{timestamp}.h264")
        self.audio_file = os.path.join(self.recording_dir, f"audio_{timestamp}.wav")
        self.final_file = os.path.join(self.recording_dir, f"recording_{timestamp}.mp4")
        
        try:
            # 同时启动视频和音频录制
            # 启动视频录制
            self.video_process = subprocess.Popen([
                "libcamera-vid",
                "-t", "0",  # 无限时长
                "-o", self.h264_file,
                "--width", "1920",
                "--height", "1080",
                "--framerate", "30",
                "--codec", "h264",
                "--bitrate", "5000000",
                "-n"  # 不显示预览窗口
            ])
            
            # 启动音频录制
            self.audio_process = subprocess.Popen([
                "arecord",
                "-D", "plughw:3,0",
                "-f", "cd",  # CD 质量 (44100 Hz, 16-bit, stereo)
                "-t", "wav",
                self.audio_file
            ])
            
            self.is_recording = True
            self.start_time = time.time()
            print(f"Recording started at {timestamp}")
            print(f"Video: {self.h264_file}")
            print(f"Audio: {self.audio_file}")
            
        except Exception as e:
            print(f"Failed to start recording: {e}")
            self.stop_recording()
    
    def stop_recording(self):
        if not self.is_recording:
            return
            
        try:
            print("Stopping recording...")
            
            # 同时发送停止信号
            stop_threads = []
            
            if self.video_process:
                t = threading.Thread(target=self._stop_process, 
                                   args=(self.video_process, "video"))
                stop_threads.append(t)
                t.start()
                
            if self.audio_process:
                t = threading.Thread(target=self._stop_process, 
                                   args=(self.audio_process, "audio"))
                stop_threads.append(t)
                t.start()
            
            # 等待所有进程停止
            for t in stop_threads:
                t.join()
            
            self.video_process = None
            self.audio_process = None
            self.is_recording = False
            
            duration = time.time() - self.start_time
            print(f"Recording stopped. Duration: {duration:.2f} seconds")
            
            # 等待文件写入完成
            time.sleep(1)
            
            # 检查文件
            if os.path.exists(self.h264_file) and os.path.exists(self.audio_file):
                video_size = os.path.getsize(self.h264_file) / 1024 / 1024
                audio_size = os.path.getsize(self.audio_file) / 1024 / 1024
                print(f"Video size: {video_size:.2f} MB")
                print(f"Audio size: {audio_size:.2f} MB")
                
                # 合并文件
                self._merge_files()
            else:
                print("Error: Recording files not found!")
                
        except Exception as e:
            print(f"Error stopping recording: {e}")
            # 强制终止
            if self.video_process:
                self.video_process.kill()
            if self.audio_process:
                self.audio_process.kill()
    
    def _stop_process(self, process, name):
        """停止单个进程"""
        try:
            # 先尝试 SIGINT (Ctrl+C)
            process.send_signal(signal.SIGINT)
            process.wait(timeout=3)
            print(f"{name} stopped gracefully")
        except subprocess.TimeoutExpired:
            # 如果超时，使用 SIGTERM
            print(f"{name} didn't stop gracefully, terminating...")
            process.terminate()
            process.wait(timeout=2)
        except Exception as e:
            print(f"Error stopping {name}: {e}")
            process.kill()
            process.wait()
    
    def _merge_files(self):
        """合并音视频文件"""
        print("Merging audio and video...")
        
        try:
            # 使用 ffmpeg 合并，跳过音频的前2.9秒
            merge_cmd = [
                "ffmpeg",
                "-i", self.h264_file,  # 视频输入（从头开始）
                "-ss", "0.8",  # 跳过音频的前2.9秒
                "-i", self.audio_file,  # 音频输入
                "-c:v", "copy",  # 直接复制视频流
                "-c:a", "aac",  # 音频编码为 AAC
                "-b:a", "192k",  # 音频比特率
                "-shortest",  # 以最短的流为准
                "-avoid_negative_ts", "make_zero",  # 避免时间戳问题
                "-y",  # 覆盖输出文件
                self.final_file
            ]
            
            result = subprocess.run(merge_cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                print(f"Successfully created: {self.final_file}")
                
                # 检查输出文件
                if os.path.exists(self.final_file):
                    final_size = os.path.getsize(self.final_file) / 1024 / 1024
                    print(f"Final file size: {final_size:.2f} MB")
                    
                    # 删除临时文件
                    os.remove(self.h264_file)
                    os.remove(self.audio_file)
                    print("Temporary files removed")
                else:
                    print("Error: Output file not created!")
            else:
                print(f"FFmpeg error: {result.stderr}")
                print("Keeping original files for debugging")
                
        except Exception as e:
            print(f"Error merging files: {e}")
            print("Original files kept for manual merging")

