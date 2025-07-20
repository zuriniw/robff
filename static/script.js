// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

// Motor control state
stop_motors = true
block_set_motors = false
mouse_dragging = false
current_speed = "moderate"  // Default speed level

// Recording state
let is_recording = false

// Pause state
let is_paused = false

// ReSpeaker/Streaming state
let user_id = "default"
let respeaker_status = {}

// Keyboard controls instance
let keyboardControls = null
let gamepadControls = null

let last_motor_command_time = 0
const motor_command_min_interval = 30  // ms

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  poll()
  $("#joystick").bind("touchstart",touchmove)
  $("#joystick").bind("touchmove",touchmove)
  $("#joystick").bind("touchend",touchend)
  $("#joystick").bind("mousedown",mousedown)
  $(document).bind("mousemove",mousemove)
  $(document).bind("mouseup",mouseup)
  
  // Initialize all control systems
  initMovementButtons()
  initRotationButtons()
  initSpeedButtons()
  initKeyboardControls()
  initGamepadControls()
  initRecordingButton()
  initServoButtons()
  initPauseButton()
  initReSpeakerControls()
  
  // 初始化UI状态，让可视化与slider值一致
  updateSliderValue('lift', document.getElementById('liftSlider').value);
  updateSliderValue('tilt', document.getElementById('tiltSlider').value);
  updateSliderValue('gripper', document.getElementById('gripperSlider').value);
}

// ============================================================================
// RESPEAKER AND STREAMING CONTROLS
// ============================================================================

function initReSpeakerControls() {
  // The HTML already contains the user ID controls, so we just need to bind events
  
  // Set user ID button handler
  $("#set-user-btn").on("click", function(e) {
    e.preventDefault()
    setUserID()
  })
  
  // Enter key handler for user ID input
  $("#user-id-input").on("keypress", function(e) {
    if (e.which === 13) { // Enter key
      setUserID()
    }
  })
}

function setUserID() {
  const id = $("#user-id-input").val().trim()
  
  if (!id) {
    alert("Please enter a valid user ID")
    return
  }
  
  // Validate user ID format (alphanumeric, dash, underscore only)
  const userIdRegex = /^[a-zA-Z0-9_-]+$/
  if (!userIdRegex.test(id)) {
    alert("User ID can only contain letters, numbers, dashes, and underscores")
    return
  }
  
  console.log("Setting user ID to:", id)
  
  $.ajax({
    url: "/set_user_id",
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({user_id: id}),
    success: function(response) {
      console.log("Server response:", response)
      const result = JSON.parse(response)
      if (result.success) {
        // Update local state immediately
        user_id = id
        $("#current-user").text(id)
        
        console.log("User ID successfully set to:", id)
        alert("User ID successfully set to: " + id)
        
        // Force multiple status refreshes to ensure update
        setTimeout(() => $.ajax({url: "status.json"}).done(update_status), 50)
        setTimeout(() => $.ajax({url: "status.json"}).done(update_status), 200)
        setTimeout(() => $.ajax({url: "status.json"}).done(update_status), 500)
        
      } else {
        alert("Failed to set User ID: " + result.message)
      }
    },
    error: function(xhr, status, error) {
      console.log("AJAX Error:", error)
      console.log("Status:", status)
      console.log("Response:", xhr.responseText)
      alert("Error setting User ID. Check console for details.")
    }
  })
}

// ============================================================================
// PAUSE CONTROL
// ============================================================================

function initPauseButton() {
  $("#pause-btn").on("click", function(e) {
    e.preventDefault()
    togglePause()
  })
}

function togglePause() {
  is_paused = !is_paused
  
  if (is_paused) {
    // 暂停时立即停止所有运动并通知服务器
    $.ajax({url: "pause"})
    $.ajax({url: "motors/0,0"})
    
    $("#pause-btn").html("RESUME")
    $("#pause-btn").addClass("paused")
    console.log("System PAUSED")
  } else {
    // 恢复时通知服务器
    $.ajax({url: "resume"})
    
    $("#pause-btn").html("PAUSE") 
    $("#pause-btn").removeClass("paused")
    console.log("System RESUMED")
  }
}

// ============================================================================
// SPEED CONTROL
// ============================================================================

function initSpeedButtons() {
  $("#slow-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) setSpeed("slow")
  })
  
  $("#moderate-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) setSpeed("moderate")
  })
  
  $("#fast-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) setSpeed("fast")
  })
}


function setSpeed(level) {
  if (is_paused) return
  
  // Update active button styling
  $(".speed-btn").removeClass("speed-active")
  $("#" + level + "-btn").addClass("speed-active")
  
  // Set current speed and update server
  current_speed = level
  $.ajax({url: "set_speed/" + level})
  
  // Sync with keyboard controls if initialized
  if (keyboardControls && keyboardControls.initialized) {
    keyboardControls.syncSpeedLevel(level)
  }
}

// ============================================================================
// MOVEMENT CONTROL - BUTTONS
// ============================================================================

function initMovementButtons() {
  // Forward button - press and hold to move forward, release to stop
  $("#forward-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    if (!is_paused) $.ajax({url: "move_forward"})
  })
  
  $("#forward-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
  
  // Backward button - press and hold to move backward, release to stop
  $("#backward-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    if (!is_paused) $.ajax({url: "move_backward"})
  })
  
  $("#backward-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
  
  // Left rotation - press and hold to rotate left, release to stop
  $("#left-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    if (!is_paused) $.ajax({url: "rotate_left"})
  })
  
  $("#left-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
  
  // Right rotation - press and hold to rotate right, release to stop
  $("#right-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    if (!is_paused) $.ajax({url: "rotate_right"})
  })
  
  $("#right-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
}

function initRotationButtons() {
  // Rotation button logic now handled in initMovementButtons
}

// ============================================================================
// MOVEMENT CONTROL - KEYBOARD (使用分离的模块) - UPDATED WITH SPEED SWITCHING
// ============================================================================

function initKeyboardControls() {
  // 确保 KeyboardControls 类已加载
  if (typeof KeyboardControls === 'undefined') {
    console.error('KeyboardControls class not found. Make sure keyboard-controls.js is loaded.')
    return
  }
  
  // 创建键盘控制实例
  keyboardControls = new KeyboardControls()
  
  // 初始化键盘控制，传入所需的依赖函数
  const success = keyboardControls.init({
    setMotors: setMotors,
    isSystemPaused: () => is_paused,
    stopMovement: () => $.ajax({url: "stop_movement"}),
    setServoPWM: setServoPWM,
    updateSliderValue: updateSliderValue,
    setSpeed: setSpeed,
    togglePause: togglePause
  })
  
  if (!success) {
    console.error('Failed to initialize keyboard controls')
    keyboardControls = null
    return
  }
  
  // 设置复合运动的自定义参数
  keyboardControls.setParameters({
    baseStrength: 200,           // 基础运动强度
    rotationFactor: 0.5,         // 旋转分量因子（相对于基础运动）
    servoStep: 50,               // 伺服步进值
    servoUpdateInterval: 50      // 伺服更新间隔
  })
  
  // 同步当前速度设置
  keyboardControls.syncSpeedLevel(current_speed)
  
  // 启用调试模式（可选，生产环境可以注释掉）
  if (typeof keyboardControls.enableDebugMode === 'function') {
    keyboardControls.enableDebugMode()
  }
  
  // 添加运动显示更新函数
  window.updateMotorDisplay = function(text) {
    $("#motor-display").text(text)
  }
  
  console.log('Enhanced keyboard controls initialized with composite movement support:')
  console.log('  WASD: Movement control (supports combinations)')
  console.log('  W+A: Forward-Left, W+D: Forward-Right')
  console.log('  S+A: Backward-Left, S+D: Backward-Right')
  console.log('  []: Speed switching')
  console.log('  SPACEBAR: Pause/Resume toggle')
  console.log('  I/J/N: Lift control, U/H/B: Tilt control')
  console.log('  -/=: Gripper control, 0-9: Servo presets')
  console.log('  Ctrl+F12: Test movement patterns (debug)')
  console.log('  Ctrl+F11: Show active keys (debug)')
  
  // 添加复合运动的视觉反馈
  addCompositeMovementFeedback()
}

/**
 * 添加复合运动的视觉反馈
 */
function addCompositeMovementFeedback() {
  // 在页面上添加运动状态显示（如果还没有的话）
  if ($("#movement-indicator").length === 0) {
    const indicator = $(`
      <div id="movement-indicator" style="
        position: fixed;
        top: 140px;
        right: 20px;
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
        z-index: 1000;
        display: none;
      ">
        Movement: None
      </div>
    `)
    $('body').append(indicator)
  }
  
  // 重写 updateMotorDisplay 以显示复合运动
  window.updateMotorDisplay = function(text) {
    $("#motor-display").text(text)
    
    // 显示详细的运动状态
    if (text.includes("L") && text.includes("R")) {
      $("#movement-indicator").text(text).show()
      
      // 3秒后隐藏
      clearTimeout(window.movementIndicatorTimeout)
      window.movementIndicatorTimeout = setTimeout(() => {
        $("#movement-indicator").fadeOut()
      }, 3000)
    }
  }
}

// ============================================================================
// GAMEPAD CONTROL INITIALIZATION
// ============================================================================

function initGamepadControls() {
  // 确保 GamepadControls 类已加载
  if (typeof GamepadControls === 'undefined') {
    console.error('GamepadControls class not found. Make sure gamepad_control.js is loaded.')
    return
  }
  
  // 创建手柄控制实例
  gamepadControls = new GamepadControls()
  
  // 初始化手柄控制，传入所需的依赖函数和宏
  const success = gamepadControls.init({
    setMotors: setMotors,
    isSystemPaused: () => is_paused,
    stopMovement: () => $.ajax({url: "stop_movement"}),
    setServoPWM: setServoPWM,
    updateSliderValue: updateSliderValue,
    servoMacros: {
      capture: servoCapture,
      lift: servoLift,
      grip: servoGrip,
      hold: servoHold
    }
  })
  
  if (!success) {
    console.error('Failed to initialize gamepad controls')
    gamepadControls = null
  } else {
    console.log('8BitDo Pro 2 gamepad controls initialized')
  }
}
// ============================================================================
// MOVEMENT CONTROL - JOYSTICK
// ============================================================================

function touchmove(e) {
  e.preventDefault()
  if (!is_paused) {
    touch = e.originalEvent.touches[0] || e.originalEvent.changedTouches[0];
    dragTo(touch.pageX, touch.pageY)
  }
}

function mousedown(e) {
  e.preventDefault()
  if (!is_paused) {
    mouse_dragging = true
  }
}

function mouseup(e) {
  if(mouse_dragging) {
    e.preventDefault()
    mouse_dragging = false
    stop_motors = true
  }
}

function mousemove(e) {
  if(mouse_dragging && !is_paused) {
    e.preventDefault()
    dragTo(e.pageX, e.pageY)
  }
}

function dragTo(x, y) {
  if (is_paused) return
  
  elm = $('#joystick').offset();
  x = x - elm.left;
  y = y - elm.top;
  w = $('#joystick').width()
  h = $('#joystick').height()

  x = (x-w/2.0)/(w/2.0)
  y = (y-h/2.0)/(h/2.0)

  if(x < -1) x = -1
  if(x > 1) x = 1
  if(y < -1) y = -1
  if(y > 1) y = 1

  // Apply speed limit based on current speed setting
  let max_speed = 400
  if (current_speed === "slow") {
    max_speed = 200
  } else if (current_speed === "moderate") {
    max_speed = 300
  }

  left_motor = Math.round(max_speed*(-y+x))
  right_motor = Math.round(max_speed*(-y-x))

  if(left_motor > max_speed) left_motor = max_speed
  if(left_motor < -max_speed) left_motor = -max_speed

  if(right_motor > max_speed) right_motor = max_speed
  if(right_motor < -max_speed) right_motor = -max_speed

  stop_motors = false
  setMotors(left_motor, right_motor)
}

function touchend(e) {
  e.preventDefault()
  stop_motors = true
}

// ============================================================================
// MOTOR COMMUNICATION
// ============================================================================

function setMotors(left, right) {
  // If paused, force motors to stop
  if (is_paused) {
    left = 0
    right = 0
  }
  
  // Throttle motor commands to prevent conflicts
  const now = Date.now()
  if (now - last_motor_command_time < motor_command_min_interval) {
    return
  }
  last_motor_command_time = now
  
  // Update motor display above joystick
  $("#motor-display").text("Motors: " + left + " " + right)

  if(block_set_motors) return
  block_set_motors = true

  $.ajax({url: "motors/"+left+","+right}).done(setMotorsDone)
}

function setMotorsDone() {
  block_set_motors = false
}

// ============================================================================
// SERVO CONTROL - PREDEFINED POSITIONS
// ============================================================================

function initServoButtons() {

  $("#servo-hold-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) servoHold()
  })
  
  $("#servo-capture-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) servoCapture()
  })
  
  $("#servo-grip-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) servoGrip()
  })
  
  $("#servo-lift-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_paused) servoLift()
  })
  
}

function servoHome() {
  if (is_paused) return
  fetch('/servo/home').then(() => {
    setTimeout(updateSlidersFromPreset, 200)
  });
}

function servoHold() {
  if (is_paused) return
  fetch('/servo/hold').then(() => {
    setTimeout(updateSlidersFromPreset, 200)
  });
}

function servoCapture() {
  if (is_paused) return
  fetch('/servo/capture').then(() => {
    setTimeout(updateSlidersFromPreset, 200)
  });
}

function servoGrip() {
  if (is_paused) return
  fetch('/servo/grip').then(() => {
    setTimeout(updateSlidersFromPreset, 200)
  });
}

function servoLift() {
  if (is_paused) return
  fetch('/servo/lift').then(() => {
    setTimeout(updateSlidersFromPreset, 200)
  });
}

function servoPark() {
  if (is_paused) return
  fetch('/servo/park').then(() => {
    setTimeout(updateSlidersFromPreset, 200)
  });
}

// ============================================================================
// SERVO CONTROL - MANUAL PWM SLIDERS (FIXED FUNCTIONS)
// ============================================================================

function updateSliderValue(servo, value) {
    // 立即更新显示值
    const valueElement = document.getElementById(servo + 'Value');
    
    if (valueElement) {
        valueElement.textContent = value;
    }
    
    // 更新象形控制的视觉效果
    switch(servo) {
        case 'lift':
            // Lift slider 是垂直的，但由于旋转，需要反转逻辑
            // 高值应该对应向上，低值对应向下
            break;
            
        case 'tilt':
            // 更新弧形指示器的角度
            updateTiltIndicator(value);
            break;
            
        case 'gripper':
            // 更新爪子的开合动画
            updateGripperClaws(value);
            break;
    }
}

function updateTiltIndicator(value) {
    const indicator = document.getElementById('tiltIndicator');
    if (indicator) {
        // FIXED: 1890(up)对应0度(12点钟)，1210(forward)对应90度(3点钟)
        const percentage = (value - 1890) / (1210 - 1890);
        const angle = 90 * percentage; // 0度(up)到90度(forward)
        indicator.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    }
}

function updateGripperClaws(value) {
    const leftClaw = document.getElementById('leftClaw');
    const rightClaw = document.getElementById('rightClaw');
    
    if (leftClaw && rightClaw) {
        // 修正gripper逻辑：由于slider被水平翻转，需要反转计算
        // 对于翻转的slider：实际的低值(500)在右边，高值(2330)在左边
        // 但我们想要：左边=close，右边=open
        // 所以需要反转value的映射
        const reversedValue = 2330 + 500 - value; // 反转值
        const percentage = (reversedValue - 500) / (2330 - 500);
        const distance = 2 + (percentage * 18); // 从2px(close，更紧密)到20px(open)
        
        leftClaw.style.transform = `translateX(-${distance}px)`;
        rightClaw.style.transform = `translateX(${distance}px)`;
    }
}

function setServoPWM(servo, value) {
  // If paused, don't send servo commands
  if (is_paused) return
  
  fetch(`/servo/pwm/${servo}/${value}`)
    .then(() => {
      // Network request completed
    });
}

function updateSlidersFromPreset() {
  fetch('/servo/pwm_values.json')
    .then(response => response.json())
    .then(data => {
      // 更新slider值
      document.getElementById('liftSlider').value = data.lift;
      document.getElementById('tiltSlider').value = data.tilt;
      document.getElementById('gripperSlider').value = data.gripper;
      
      // 更新显示和视觉效果
      updateSliderValue('lift', data.lift);
      updateSliderValue('tilt', data.tilt);
      updateSliderValue('gripper', data.gripper);
    });
}

// ============================================================================
// ENHANCED RECORDING CONTROL WITH RESPEAKER
// ============================================================================

function initRecordingButton() {
  $("#record-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_recording) {
      // Start recording
      $.ajax({url: "start_recording"}).done(function(response) {
        const result = JSON.parse(response)
        if (result.success) {
          is_recording = true
          $("#record-btn").html("Stop Recording")
          $("#record-btn").css("background-color", "#ff4444")
          console.log("Recording started with ReSpeaker support")
        } else {
          alert("Failed to start recording")
        }
      }).fail(function() {
        alert("Error starting recording")
      })
    } else {
      // Stop recording
      $.ajax({url: "stop_recording"}).done(function(response) {
        const result = JSON.parse(response)
        if (result.success) {
          is_recording = false
          $("#record-btn").html("Start Recording")
          $("#record-btn").css("background-color", "")
          console.log("Recording stopped")
        } else {
          alert("Failed to stop recording")
        }
      }).fail(function() {
        alert("Error stopping recording")
      })
    }
  })
}

// ============================================================================
// LED AND BUZZER CONTROL
// ============================================================================

function setLeds() {
  led0 = $('#led0')[0].checked ? 1 : 0
  led1 = $('#led1')[0].checked ? 1 : 0
  led2 = $('#led2')[0].checked ? 1 : 0
  $.ajax({url: "leds/"+led0+","+led1+","+led2})
}

function playNotes() {
  notes = $('#notes').val()
  $.ajax({url: "play_notes/"+notes})
}

// ============================================================================
// STATUS POLLING AND UPDATES
// ============================================================================

function poll() {
  $.ajax({url: "status.json"}).done(update_status)
  if(stop_motors && !block_set_motors) {
    setMotors(0,0);
    stop_motors = false
  }
}

function update_status(json) {
  s = JSON.parse(json)
  $("#button0").html(s["buttons"][0] ? '1' : '0')
  $("#button1").html(s["buttons"][1] ? '1' : '0')
  $("#button2").html(s["buttons"][2] ? '1' : '0')

  $("#battery_millivolts").html(s["battery_millivolts"])

  $("#analog0").html(s["analog"][0])
  $("#analog1").html(s["analog"][1])
  $("#analog2").html(s["analog"][2])
  $("#analog3").html(s["analog"][3])
  $("#analog4").html(s["analog"][4])
  $("#analog5").html(s["analog"][5])
  
  $("#encoders0").html(s["encoders"][0])
  $("#encoders1").html(s["encoders"][1])
  
  // Update servo status if available
  if (s["servo_status"]) {
    $("#servo-position").html(s["servo_status"]["position"])
    $("#servo-enabled").html(s["servo_status"]["enabled"] ? "Yes" : "No")
  }
  
  // Update speed button styling if it changed on the server
  if (s["speed_level"] !== current_speed) {
    current_speed = s["speed_level"]
    $(".speed-btn").removeClass("speed-active")
    $("#" + current_speed + "-btn").addClass("speed-active")
    
    // Sync with keyboard controls if initialized - NEW
    if (keyboardControls && keyboardControls.initialized) {
      keyboardControls.syncSpeedLevel(current_speed)
    }
  }

  // Sync pause state with server
  if (s["paused"] !== undefined && s["paused"] !== is_paused) {
    is_paused = s["paused"]
    if (is_paused) {
      $("#pause-btn").html("RESUME")
      $("#pause-btn").addClass("paused")
    } else {
      $("#pause-btn").html("PAUSE")
      $("#pause-btn").removeClass("paused")
    }
  }

  // Update ReSpeaker/Recording status
  if (s["recording"]) {
    respeaker_status = s["recording"]
    updateReSpeakerDisplay(respeaker_status)
    
    // Sync recording state
    if (s["recording"]["is_recording"] !== is_recording) {
      is_recording = s["recording"]["is_recording"]
      if (is_recording) {
        $("#record-btn").html("Stop Recording")
        $("#record-btn").css("background-color", "#ff4444")
      } else {
        $("#record-btn").html("Start Recording")
        $("#record-btn").css("background-color", "")
      }
    }
  }

  // Update user ID from top-level status (this will override recording status)
  if (s["user_id"] && !$("#user-id-input").is(':focus')) {
    $("#current-user").text(s["user_id"])
    $("#user-id-input").val(s["user_id"])
    user_id = s["user_id"]
  }

  setTimeout(poll, 100)
}

function updateReSpeakerDisplay(status) {
  // Update ReSpeaker initialization status
  if (status.respeaker_available && status.respeaker_initialized) {
    $("#respeaker-init").text("Initialized").css("color", "green")
  } else if (status.respeaker_available) {
    $("#respeaker-init").text("Available, not initialized").css("color", "orange")
  } else {
    $("#respeaker-init").text("Not available").css("color", "red")
  }
  
  // Update streaming status (always shows laptop IP since it's fixed)
  if (status.ssh_connected && status.video_streaming) {
    $("#streaming-status").text("Connected & Streaming to " + status.laptop_ip).css("color", "green")
  } else {
    $("#streaming-status").text("Ready to stream to " + status.laptop_ip).css("color", "orange")
  }
  
  // Update current user ID - FIXED: Don't override input field when user is typing
  if (status.user_id) {
    $("#current-user").text(status.user_id)
    user_id = status.user_id
    
    // Only update input if it's not currently focused (user not typing)
    if (!$("#user-id-input").is(':focus')) {
      $("#user-id-input").val(status.user_id)
    }
  }
  
  // Update current DOA
  if (status.current_doa !== undefined && status.current_doa !== null) {
    $("#current-doa").text(status.current_doa)
  } else {
    $("#current-doa").text("--")
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shutdown() {
  if (confirm("Really shut down the Raspberry Pi?"))
    return true
  return false
}