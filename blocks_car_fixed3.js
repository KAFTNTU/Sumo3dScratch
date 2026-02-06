// === 🚗 ROBOT CAR BLOCKS & XML ===

window.CAR_CATEGORY = `
<category name="🚗 Машинка" colour="#4C97FF">
    <block type="start_hat"></block>
    <block type="robot_move">
        <value name="L"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="R"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="robot_move_soft">
        <value name="TARGET"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="SEC"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="robot_turn_timed">
            <field name="DIR">LEFT</field>
            <value name="SEC"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value>
    </block>
    <block type="robot_set_speed">
        <value name="SPEED"><shadow type="math_number_limited"><field name="NUM">50</field></shadow></value>
    </block>
    <block type="robot_stop"></block>
    <block type="move_4_motors">
        <value name="M1"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="M2"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="M3"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="M4"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="motor_single">
        <value name="SPEED"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="go_home"></block>
    <block type="record_start"></block>
    <block type="replay_track"></block>
    <block type="wait_start"></block>
    <block type="stop_at_start"></block>
    <block type="replay_loop">
            <value name="TIMES"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="count_laps">
            <value name="LAPS"><shadow type="math_number"><field name="NUM">3</field></shadow></value>
    </block>
    <block type="autopilot_distance"></block>
</category>
`;

Blockly.Blocks['start_hat'] = { 
    init: function() { 
        this.appendDummyInput().appendField("🏁 СТАРТ"); 
        this.setNextStatement(true); 
        this.setColour(120); 
    } 
};
javascript.javascriptGenerator.forBlock['start_hat'] = function(b) { return ''; };

Blockly.Blocks['robot_move'] = { 
    init: function() { 
        this.appendDummyInput().appendField("🚗 Їхати"); this.appendValueInput("L").setCheck("Number").appendField("L"); this.appendValueInput("R").setCheck("Number").appendField("R"); 
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); 
    } 
};
javascript.javascriptGenerator.forBlock['robot_move'] = function(b) {
    var l = javascript.javascriptGenerator.valueToCode(b, 'L', javascript.Order.ATOMIC) || '0';
    var r = javascript.javascriptGenerator.valueToCode(b, 'R', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    var appliedL = ${l} * (typeof _blocklySpeedMultiplier !== 'undefined' ? _blocklySpeedMultiplier : 1.0);
    var appliedR = ${r} * (typeof _blocklySpeedMultiplier !== 'undefined' ? _blocklySpeedMultiplier : 1.0);
    recordMove(appliedL, appliedR, appliedL, appliedR); 
    await sendDrivePacket(appliedL, appliedR, appliedL, appliedR);\n`;
};

Blockly.Blocks['robot_move_soft'] = {
    init: function() {
        this.appendDummyInput().appendField("🚀 Плавний старт до");
        this.appendValueInput("TARGET").setCheck("Number");
        this.appendValueInput("SEC").setCheck("Number").appendField("за (сек)");
        this.setInputsInline(true);
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['robot_move_soft'] = function(block) {
    var target = javascript.javascriptGenerator.valueToCode(block, 'TARGET', javascript.Order.ATOMIC) || '100';
    var sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '1';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    var steps = ${sec} * 20; 
    for(var i=1; i<=steps; i++) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        var current = (${target} / steps) * i;
        var applied = current * (typeof _blocklySpeedMultiplier !== 'undefined' ? _blocklySpeedMultiplier : 1.0);
        await sendDrivePacket(applied, applied, applied, applied);
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

Blockly.Blocks['robot_turn_timed'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🔄 Поворот")
            .appendField(new Blockly.FieldDropdown([["Ліворуч ⬅️","LEFT"], ["Праворуч ➡️","RIGHT"]]), "DIR");
        this.appendValueInput("SEC").setCheck("Number").appendField("на");
        this.appendDummyInput().appendField("сек");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); 
    }
};
javascript.javascriptGenerator.forBlock['robot_turn_timed'] = function(block) {
    var dir = block.getFieldValue('DIR');
    var sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '0.5';
    var l = (dir === 'LEFT') ? -80 : 80;
    var r = (dir === 'LEFT') ? 80 : -80;
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    recordMove(${l}, ${r}, ${l}, ${r});
    await sendDrivePacket(${l}, ${r}, ${l}, ${r});
    await new Promise(r => setTimeout(r, ${sec} * 1000));
    recordMove(0,0,0,0);
    await sendDrivePacket(0,0,0,0);
    \n`;
};

Blockly.Blocks['robot_set_speed'] = {
    init: function() {
        this.appendDummyInput().appendField("⚡ Швидкість");
        this.appendValueInput("SPEED").setCheck("Number");
        this.appendDummyInput().appendField("%");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); 
    }
};
javascript.javascriptGenerator.forBlock['robot_set_speed'] = function(block) {
    var s = javascript.javascriptGenerator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '100';
    return `_blocklySpeedMultiplier = ${s} / 100.0;\n`;
};

Blockly.Blocks['robot_stop'] = { init: function() { this.appendDummyInput().appendField("🛑 Стоп"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(0); } };
javascript.javascriptGenerator.forBlock['robot_stop'] = function() { return `recordMove(0,0,0,0); await sendDrivePacket(0,0,0,0);\n`; };

Blockly.Blocks['move_4_motors'] = { 
    init: function() { 
        this.appendDummyInput().appendField("🚙 4 Мотори (ABCD)");
        this.appendValueInput("M1").setCheck("Number").appendField("A:");
        this.appendValueInput("M2").setCheck("Number").appendField("B:");
        this.appendValueInput("M3").setCheck("Number").appendField("C:");
        this.appendValueInput("M4").setCheck("Number").appendField("D:");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    } 
};
javascript.javascriptGenerator.forBlock['move_4_motors'] = function(block) {
    var m1 = javascript.javascriptGenerator.valueToCode(block, 'M1', javascript.Order.ATOMIC) || '0';
    var m2 = javascript.javascriptGenerator.valueToCode(block, 'M2', javascript.Order.ATOMIC) || '0';
    var m3 = javascript.javascriptGenerator.valueToCode(block, 'M3', javascript.Order.ATOMIC) || '0';
    var m4 = javascript.javascriptGenerator.valueToCode(block, 'M4', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    await sendDrivePacket(${m1}, ${m2}, ${m3}, ${m4});\n`;
};

Blockly.Blocks['motor_single'] = { 
    init: function() { 
        this.appendDummyInput()
            .appendField("⚙️ Мотор")
            .appendField(new Blockly.FieldDropdown([["A","1"], ["B","2"], ["C","3"], ["D","4"]]), "MOTOR")
            .appendField("Шв:");
        this.appendValueInput("SPEED").setCheck("Number");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    } 
};
javascript.javascriptGenerator.forBlock['motor_single'] = function(block) {
    var m = block.getFieldValue('MOTOR'); 
    var s = javascript.javascriptGenerator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    var current = window.motorState || {m1:0, m2:0, m3:0, m4:0};
    var m1 = current.m1, m2 = current.m2, m3 = current.m3, m4 = current.m4;
    if('${m}' == '1') m1 = ${s};
    if('${m}' == '2') m2 = ${s};
    if('${m}' == '3') m3 = ${s};
    if('${m}' == '4') m4 = ${s};
    await sendDrivePacket(m1, m2, m3, m4);
    \n`;
};

// --- LOGIC, SENSORS & RECORDING ---

Blockly.Blocks['record_start'] = {
    init: function() {
        this.appendDummyInput().appendField("🔴 Запам'ятати трасу (Почати запис)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    }
};
javascript.javascriptGenerator.forBlock['record_start'] = function(block) {
    return `window._trackMemory = []; window._isRecordingTrack = true; console.log("Recording started...");\n`;
};

Blockly.Blocks['replay_track'] = {
    init: function() {
        this.appendDummyInput().appendField("▶️ Відтворити записану трасу");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    }
};
javascript.javascriptGenerator.forBlock['replay_track'] = function(block) {
    return `
    window._isRecordingTrack = false; 
    if (window._trackMemory.length > 0) {
        for (let i = 0; i < window._trackMemory.length; i++) {
            if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
            let step = window._trackMemory[i];
            if (i > 0) {
                let delay = step.t - window._trackMemory[i-1].t;
                if (delay > 0) await new Promise(r => setTimeout(r, delay));
            }
            await sendDrivePacket(step.l, step.r, step.m3, step.m4);
        }
        await sendDrivePacket(0,0,0,0);
    }
    \n`;
};

Blockly.Blocks['replay_loop'] = {
    init: function() {
        this.appendDummyInput().appendField("🔄 Повторити трасу з пам'яті");
        this.appendValueInput("TIMES").setCheck("Number");
        this.appendDummyInput().appendField("разів");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    }
};
javascript.javascriptGenerator.forBlock['replay_loop'] = function(block) {
    let times = javascript.javascriptGenerator.valueToCode(block, 'TIMES', javascript.Order.ATOMIC) || '1';
    return `
    window._isRecordingTrack = false;
    for(let loop=0; loop < ${times}; loop++) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        if (window._trackMemory.length > 0) {
            for (let i = 0; i < window._trackMemory.length; i++) {
                if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
                let step = window._trackMemory[i];
                if (i > 0) {
                    let delay = step.t - window._trackMemory[i-1].t;
                    if (delay > 0) await new Promise(r => setTimeout(r, delay));
                }
                await sendDrivePacket(step.l, step.r, step.m3, step.m4);
            }
            await sendDrivePacket(0,0,0,0);
            await new Promise(r => setTimeout(r, 500));
        }
    }
    \n`;
};

Blockly.Blocks['go_home'] = { init: function() { this.appendDummyInput().appendField("🏠 Додому (Назад)"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); } }; 
javascript.javascriptGenerator.forBlock['go_home'] = function() { return 'await goHomeSequence();\n'; };

Blockly.Blocks['wait_start'] = {
    init: function() {
        this.appendDummyInput().appendField("🏁 Чекати Старт (Чорна лінія)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40); 
    }
};
javascript.javascriptGenerator.forBlock['wait_start'] = function(block) {
    return `
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        let s1 = window.sensorData ? window.sensorData[0] : 0; 
        if (s1 > 60) break;
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

Blockly.Blocks['stop_at_start'] = {
    init: function() {
        this.appendDummyInput().appendField("🛑 Зупинитися на старті");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(0); 
    }
};
javascript.javascriptGenerator.forBlock['stop_at_start'] = function(block) {
    return `
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        let s1 = window.sensorData ? window.sensorData[0] : 0;
        if (s1 > 60) break; 
        await new Promise(r => setTimeout(r, 20));
    }
    await sendDrivePacket(0,0,0,0);
    \n`;
};

Blockly.Blocks['count_laps'] = {
    init: function() {
        this.appendValueInput("LAPS").setCheck("Number").appendField("🔢 Лічити кола до"); 
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40); 
    }
};
javascript.javascriptGenerator.forBlock['count_laps'] = function(block) {
    let laps = javascript.javascriptGenerator.valueToCode(block, 'LAPS', javascript.Order.ATOMIC) || '1';
    return `
    let lapsTarget = ${laps}; let lapsCounted = 0; let onLine = false;
    while(lapsCounted < lapsTarget) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        let s = (window.sensorData && window.sensorData[0] > 60); 
        if (s && !onLine) { onLine = true; lapsCounted++; } else if (!s && onLine) { onLine = false; }
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

// --- SENSORS & LOGIC ---

Blockly.Blocks['wait_seconds'] = { 
    init: function() { 
        this.appendDummyInput().appendField("⏳ Чекати");
        this.appendValueInput("SECONDS").setCheck("Number");
        this.appendDummyInput().appendField("сек");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40); 
    } 
};
javascript.javascriptGenerator.forBlock['wait_seconds'] = function(b) { 
    var s = javascript.javascriptGenerator.valueToCode(b, 'SECONDS', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    recordWait(${s}); 
    await new Promise(r => setTimeout(r, ${s} * 1000));
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    \n`; 
};

Blockly.Blocks['sensor_get'] = { 
    init: function() { 
        this.appendDummyInput()
            .appendField(new Blockly.FieldDropdown([["📏 Відстань", "DIST"], ["💡 Світло", "LIGHT"], ["👆 Дотик", "TOUCH"]]), "TYPE")
            .appendField("Порт")
            .appendField(new Blockly.FieldDropdown([["1","0"], ["2","1"], ["3","2"], ["4","3"]]), "SENS");
        this.setOutput(true, "Number"); 
        this.setColour(180); 
    } 
};
javascript.javascriptGenerator.forBlock['sensor_get'] = function(b) { 
    var idx = b.getFieldValue('SENS');
    return [`(window.sensorData ? window.sensorData[${idx}] : 0)`, javascript.Order.ATOMIC]; 
};

Blockly.Blocks['wait_until_sensor'] = {
     init: function() { 
        this.appendValueInput("VAL").setCheck("Number").appendField("⏳ Чекати, поки Порт").appendField(new Blockly.FieldDropdown([["1","0"], ["2","1"], ["3","2"], ["4","3"]]), "SENS").appendField(new Blockly.FieldDropdown([["<", "LT"], [">", "GT"]]), "OP");
        this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40);
    }
};
javascript.javascriptGenerator.forBlock['wait_until_sensor'] = function(block) {
    var s = block.getFieldValue('SENS');
    var op = block.getFieldValue('OP') === 'LT' ? '<' : '>';
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || '0';
    return `
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        var currentVal = window.sensorData ? window.sensorData[${s}] : 0;
        if (currentVal ${op} ${val}) break;
        await new Promise(r => setTimeout(r, 50)); 
    }
    \n`;
};

Blockly.Blocks['math_number_limited'] = {
    init: function() {
        this.appendDummyInput().appendField(new Blockly.FieldNumber(100, -100, 100), "NUM"); 
        this.setOutput(true, "Number"); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['math_number_limited'] = function(block) {
    return [block.getFieldValue('NUM'), javascript.Order.ATOMIC];
};

Blockly.Blocks['logic_edge_detect'] = {
    init: function() {
        this.appendDummyInput().appendField("⚡ Сигнал став активним (0→1)");
        this.appendValueInput("VAL").setCheck(null).appendField("Перевірити");
        this.setOutput(true, "Boolean"); this.setColour(210); this.setInputsInline(true);
    }
};
javascript.javascriptGenerator.forBlock['logic_edge_detect'] = function(block) {
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || 'false';
    var id = block.id;
    return [`checkRisingEdge('${id}', ${val})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['logic_schmitt'] = {
    init: function() {
        this.appendDummyInput().appendField("🛡️ Вкл >"); this.appendValueInput("HIGH").setCheck("Number");
        this.appendDummyInput().appendField("Викл <"); this.appendValueInput("LOW").setCheck("Number");
        this.appendValueInput("VAL").setCheck("Number").appendField("Значення");
        this.setOutput(true, "Boolean"); this.setColour(210); this.setInputsInline(true);
    }
};
javascript.javascriptGenerator.forBlock['logic_schmitt'] = function(block) {
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || '0';
    var low = javascript.javascriptGenerator.valueToCode(block, 'LOW', javascript.Order.ATOMIC) || '30';
    var high = javascript.javascriptGenerator.valueToCode(block, 'HIGH', javascript.Order.ATOMIC) || '70';
    var id = block.id;
    return [`schmittTrigger('${id}', ${val}, ${low}, ${high})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['math_smooth'] = {
    init: function() {
        this.appendValueInput("VAL").setCheck("Number").appendField("🌊 Згладити");
        this.appendDummyInput().appendField("К-сть:").appendField(new Blockly.FieldNumber(5, 2, 50), "SIZE");
        this.setOutput(true, "Number"); this.setColour(230); this.setInputsInline(true);
    }
};
javascript.javascriptGenerator.forBlock['math_smooth'] = function(block) {
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || '0';
    var size = block.getFieldValue('SIZE');
    var id = block.id;
    return [`smoothValue('${id}', ${val}, ${size})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['math_pid'] = {
    init: function() {
        this.appendDummyInput().appendField("🎛️ PID Регулятор");
        this.appendValueInput("ERROR").setCheck("Number").appendField("Помилка");
        this.appendValueInput("KP").setCheck("Number").appendField("Kp");
        this.appendValueInput("KI").setCheck("Number").appendField("Ki");
        this.appendValueInput("KD").setCheck("Number").appendField("Kd");
        this.setOutput(true, "Number"); this.setInputsInline(true); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['math_pid'] = function(block) {
    var error = javascript.javascriptGenerator.valueToCode(block, 'ERROR', javascript.Order.ATOMIC) || '0';
    var kp = javascript.javascriptGenerator.valueToCode(block, 'KP', javascript.Order.ATOMIC) || '1';
    var ki = javascript.javascriptGenerator.valueToCode(block, 'KI', javascript.Order.ATOMIC) || '0';
    var kd = javascript.javascriptGenerator.valueToCode(block, 'KD', javascript.Order.ATOMIC) || '0';
    return [`calculatePID(${error}, ${kp}, ${ki}, ${kd})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['timer_get'] = {
    init: function() {
        this.appendDummyInput().appendField("⏱️ Таймер (с)");
        this.setOutput(true, "Number"); this.setColour(40);
    }
};
javascript.javascriptGenerator.forBlock['timer_get'] = function(block) {
    return [`((new Date().getTime() - _startTime) / 1000)`, javascript.Order.ATOMIC];
};

Blockly.Blocks['timer_reset'] = {
    init: function() {
        this.appendDummyInput().appendField("🔄 Скинути таймер");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40);
    }
};
javascript.javascriptGenerator.forBlock['timer_reset'] = function(block) {
    return `_startTime = new Date().getTime();\n`;
};



// === 🤖 Autopilot by distance sensor (simple avoid) ===
Blockly.Blocks['autopilot_distance'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🤖 Автопілот (датчик)")
            .appendField("Port")
            .appendField(new Blockly.FieldDropdown([["1","1"],["2","2"],["3","3"],["4","4"]]), "PORT")
            .appendField("поворот")
            .appendField(new Blockly.FieldDropdown([["RIGHT","RIGHT"],["LEFT","LEFT"]]), "DIR");
        this.appendValueInput("THR").setCheck("Number").appendField("якщо <");
        this.appendValueInput("SPD").setCheck("Number").appendField("швидк.");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(20);
    }
};

javascript.javascriptGenerator.forBlock['autopilot_distance'] = function(block) {
    const port = block.getFieldValue('PORT'); // "1".."4"
    const dir = block.getFieldValue('DIR');
    const thr = javascript.javascriptGenerator.valueToCode(block, 'THR', javascript.Order.ATOMIC) || '40';
    const spd = javascript.javascriptGenerator.valueToCode(block, 'SPD', javascript.Order.ATOMIC) || '60';

    return `
    // autopilot loop (STOP breaks)
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";

        const idx = Math.max(0, Math.min(3, (parseInt(${port}) - 1)));
        const s = window.sensorData ? (window.sensorData[idx] || 0) : 0;

        if (s > 0 && s < (${thr})) {
            // obstacle: back then turn
            await window.sendDrivePacket(-(${spd}), -(${spd}), 0, 0);
            await new Promise(r => setTimeout(r, 250));

            if ('${dir}' === 'LEFT') {
                await window.sendDrivePacket(-(${spd}), (${spd}), 0, 0);
            } else {
                await window.sendDrivePacket((${spd}), -(${spd}), 0, 0);
            }
            await new Promise(r => setTimeout(r, 320));

            await window.sendDrivePacket(0, 0, 0, 0);
            await new Promise(r => setTimeout(r, 80));
        } else {
            await window.sendDrivePacket((${spd}), (${spd}), 0, 0);
            await new Promise(r => setTimeout(r, 80));
        }
    }
    \n`;
};
