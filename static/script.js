// Copyright Pololu Corporation.  For more information, see https://www.pololu.com/
stop_motors = true
block_set_motors = false
mouse_dragging = false
current_speed = "fast"  // Default speed level

// Keyboard control state
let keys_pressed = {
  w: false,
  a: false,
  s: false,
  d: false
}
let is_recording = false

function init() {
  poll()
  $("#joystick").bind("touchstart",touchmove)
  $("#joystick").bind("touchmove",touchmove)
  $("#joystick").bind("touchend",touchend)
  $("#joystick").bind("mousedown",mousedown)
  $(document).bind("mousemove",mousemove)
  $(document).bind("mouseup",mouseup)
  
  // Initialize movement buttons
  initMovementButtons()
  initRotationButtons()
  initSpeedButtons()
  initKeyboardControls()
  initRecordingButton()
  initServoButtons()  // Add servo button initialization
}

function initSpeedButtons() {
  // Speed buttons click handlers
  $("#slow-btn").on("click", function(e) {
    e.preventDefault()
    setSpeed("slow")
  })
  
  $("#moderate-btn").on("click", function(e) {
    e.preventDefault()
    setSpeed("moderate")
  })
  
  $("#fast-btn").on("click", function(e) {
    e.preventDefault()
    setSpeed("fast")
  })
}

function setSpeed(level) {
  // Update active button styling
  $(".speed-btn").removeClass("speed-active")
  $("#" + level + "-btn").addClass("speed-active")
  
  // Set current speed and update server
  current_speed = level
  $.ajax({url: "set_speed/" + level})
}

function initMovementButtons() {
  // Forward button - press and hold to move forward, release to stop
  $("#forward-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    $.ajax({url: "move_forward"})
  })
  
  $("#forward-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
  
  // Backward button - press and hold to move backward, release to stop
  $("#backward-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    $.ajax({url: "move_backward"})
  })
  
  $("#backward-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
  
  // Left rotation - press and hold to rotate left, release to stop
  $("#left-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    $.ajax({url: "rotate_left"})
  })
  
  $("#left-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
  
  // Right rotation - press and hold to rotate right, release to stop
  $("#right-btn").on("mousedown touchstart", function(e) {
    e.preventDefault()
    $.ajax({url: "rotate_right"})
  })
  
  $("#right-btn").on("mouseup mouseleave touchend", function(e) {
    e.preventDefault()
    $.ajax({url: "stop_movement"})
  })
}

function initRotationButtons() {
  // Remove old rotation button logic - now handled in initMovementButtons
}

// Add servo button initialization
function initServoButtons() {
  $("#servo-home-btn").on("click", function(e) {
    e.preventDefault()
    $.ajax({url: "servo/home"})
  })
  
  $("#servo-capture-btn").on("click", function(e) {
    e.preventDefault()
    $.ajax({url: "servo/capture"})
  })
  
  $("#servo-grip-btn").on("click", function(e) {
    e.preventDefault()
    $.ajax({url: "servo/grip"})
  })
  
  $("#servo-lift-btn").on("click", function(e) {
    e.preventDefault()
    $.ajax({url: "servo/lift"})
  })
  
  $("#servo-park-btn").on("click", function(e) {
    e.preventDefault()
    $.ajax({url: "servo/park"})
  })
}

function poll() {
  $.ajax({url: "status.json"}).done(update_status)
  if(stop_motors && !block_set_motors)
  {
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
  }

  setTimeout(poll, 100)
}

function touchmove(e) {
  e.preventDefault()
  touch = e.originalEvent.touches[0] || e.originalEvent.changedTouches[0];
  dragTo(touch.pageX, touch.pageY)
}

function mousedown(e) {
  e.preventDefault()
  mouse_dragging = true
}

function mouseup(e) {
  if(mouse_dragging)
  {
    e.preventDefault()
    mouse_dragging = false
    stop_motors = true
  }
}

function mousemove(e) {
  if(mouse_dragging)
  {
    e.preventDefault()
    dragTo(e.pageX, e.pageY)
  }
}

function dragTo(x, y) {
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

function setMotors(left, right) {
  $("#joystick").html("Motors: " + left + " "+ right)

  if(block_set_motors) return
  block_set_motors = true

  $.ajax({url: "motors/"+left+","+right}).done(setMotorsDone)
}

function setMotorsDone() {
  block_set_motors = false
}

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

function shutdown() {
  if (confirm("Really shut down the Raspberry Pi?"))
    return true
  return false
}

function initKeyboardControls() {
  $(document).on("keydown", function(e) {
    let key = e.key.toLowerCase()
    if (key in keys_pressed && !keys_pressed[key]) {
      keys_pressed[key] = true
      updateMovementFromKeys()
      e.preventDefault()
    }
  })
  
  $(document).on("keyup", function(e) {
    let key = e.key.toLowerCase()
    if (key in keys_pressed && keys_pressed[key]) {
      keys_pressed[key] = false
      updateMovementFromKeys()
      e.preventDefault()
    }
  })
}

function updateMovementFromKeys() {
  let forward = keys_pressed.w
  let backward = keys_pressed.s
  let left = keys_pressed.a
  let right = keys_pressed.d
  
  // Check if any movement key is pressed
  if (!forward && !backward && !left && !right) {
    $.ajax({url: "stop_movement"})
    return
  }
  
  // For keyboard, we'll calculate like joystick but use fixed patterns
  let left_motor = 0
  let right_motor = 0
  let base_strength = 200  // Match button base_speed = 200
  
  // Forward/backward movement
  if (forward && !backward) {
    left_motor += base_strength
    right_motor += base_strength
  } else if (backward && !forward) {
    left_motor -= base_strength
    right_motor -= base_strength
  }
  
  // Left/right rotation (can combine with forward/backward)
  if (left && !right) {
    left_motor -= base_strength * 0.6  // Reduce left motor for left turn
    right_motor += base_strength * 0.6  // Increase right motor for left turn
  } else if (right && !left) {
    left_motor += base_strength * 0.6  // Increase left motor for right turn
    right_motor -= base_strength * 0.6  // Reduce right motor for right turn
  }
  
  // Limit motor values
  left_motor = Math.max(-200, Math.min(200, left_motor))
  right_motor = Math.max(-200, Math.min(200, right_motor))
  
  // Send to motors (this will go through server speed adjustment like joystick)
  setMotors(Math.round(left_motor), Math.round(right_motor))
}

function initRecordingButton() {
  $("#record-btn").on("click", function(e) {
    e.preventDefault()
    if (!is_recording) {
      // Start recording
      $.ajax({url: "start_recording"}).done(function() {
        is_recording = true
        $("#record-btn").html("⏹️ Stop Recording")
        $("#record-btn").css("background-color", "#ff4444")
      })
    } else {
      // Stop recording
      $.ajax({url: "stop_recording"}).done(function() {
        is_recording = false
        $("#record-btn").html("🔴 Start Recording")
        $("#record-btn").css("background-color", "")
      })
    }
  })
}