// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
stop_motors = true
block_set_motors = false
mouse_dragging = false
current_speed = "moderate"  // Default speed level

let is_recording = false
let is_paused = false

let user_id = "user123"
let respeaker_status = {}

let keyboardControls = null

let last_motor_command_time = 0
const motor_command_min_interval = 30  // ms

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  poll()
  initMovementButtons()
  initRotationButtons()
  initSpeedButtons()
  initKeyboardControls()
  initRecordingButton()
  initServoButtons()
  initPauseButton()
  initReSpeakerControls()
  
  updateSliderValue('lift', document.getElementById('liftSlider').value);
  updateSliderValue('tilt', document.getElementById('tiltSlider').value);
  updateSliderValue('gripper', document.getElementById('gripperSlider').value);
}

// ============================================================================
// RESPEAKER AND STREAMING CONTROLS
// ============================================================================

let isSettingUserId = false

function initReSpeakerControls() {
  $("#set-user-btn").on("click", function(e) {
    e.preventDefault()
    setUserID()
  })
  
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
  
  const userIdRegex = /^[a-zA-Z0-9_-]+$/
  if (!userIdRegex.test(id)) {
    alert("User ID can only contain letters, numbers, dashes, and underscores")
    return
  }
  
  $.ajax({
    url: "/set_user_id",
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({user_id: id}),
    success: function(response) {
      const result = JSON.parse(response)
      if (result.success) {
        // 强制更新界面显示
        $("#current-user").text(result.user_id)
        user_id = result.user_id
        console.log("User ID set to:", result.user_id)
      } else {
        alert("Failed to set User ID: " + result.message)
      }
    },
    error: function(xhr, status, error) {
      alert("Error setting User ID: " + error)
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
  keyboardControls = new KeyboardControls()
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
  keyboardControls.syncSpeedLevel(current_speed)
  window.updateMotorDisplay = function(text) {
    $("#motor-display").text(text)
  }
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
    if (text.includes("L") && text.includes("R")) {
      $("#movement-indicator").text(text).show()
      clearTimeout(window.movementIndicatorTimeout)
      window.movementIndicatorTimeout = setTimeout(() => {
        $("#movement-indicator").fadeOut()
      }, 3000)
    }
  }
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
            break;
        case 'tilt':
            updateTiltIndicator(value);
            break;
        case 'gripper':
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
        indicator.style.transform = `translateX(-50%) rotate(${angle+90}deg)`;
    }
}

function updateGripperClaws(value) {
    const leftClaw = document.getElementById('leftClaw');
    const rightClaw = document.getElementById('rightClaw');
    
    if (leftClaw && rightClaw) {
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
  
  // 更新硬件状态
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
  
  // Update servo status
  if (s["servo_status"]) {
    $("#servo-position").html(s["servo_status"]["position"])
    $("#servo-enabled").html(s["servo_status"]["enabled"] ? "Yes" : "No")
  }
  
  // Update speed level
  if (s["speed_level"] !== current_speed) {
    current_speed = s["speed_level"]
    $(".speed-btn").removeClass("speed-active")
    $("#" + current_speed + "-btn").addClass("speed-active")
    
    if (keyboardControls && keyboardControls.initialized) {
      keyboardControls.syncSpeedLevel(current_speed)
    }
  }

  // Sync pause state
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

  // Update recording status
  if (s["recording"]) {
    respeaker_status = s["recording"]
    updateReSpeakerDisplay(respeaker_status)
    
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