// === 🕷️ SPIDER ROBOT BLOCKS & XML ===

window.SPIDER_CATEGORY = `
<category name="🕷️ Павук" colour="#A855F7">
     <block type="spider_center"></block>
     <block type="spider_step"><field name="DIR">FWD</field></block>
     <block type="spider_walk_while"><field name="DIR">FWD</field></block>
     <block type="spider_walk_time">
        <field name="DIR">FWD</field>
        <value name="SEC"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
     </block>
     <block type="spider_turn_smooth">
        <value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value>
     </block>
     <block type="spider_leg_control">
         <value name="VAL"><shadow type="math_number"><field name="NUM">90</field></shadow></value>
     </block>
     <block type="spider_config">
         <value name="HEIGHT"><shadow type="math_number"><field name="NUM">40</field></shadow></value>
         <value name="SPEED"><shadow type="math_number"><field name="NUM">100</field></shadow></value>
     </block>
     <block type="spider_anim"><field name="ANIM">WAVE</field></block>
     <block type="spider_joystick_ctrl"></block>
     <block type="spider_stop"></block>
</category>
`;

Blockly.Blocks['spider_center'] = {
    init: function() {
        this.appendDummyInput().appendField("🕷️ Центрувати всі ноги (90°)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_center'] = function() {
    return `await sendSpiderPacket(90,90,90,90,90,90,90,90); await new Promise(r => setTimeout(r, 500));\n`;
};

Blockly.Blocks['spider_step'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🦶 Крокнути")
            .appendField(new Blockly.FieldDropdown([["Вперед ⬆️", "FWD"], ["Назад ⬇️", "BWD"], ["Вліво ⬅️", "LEFT"], ["Вправо ➡️", "RIGHT"]]), "DIR");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_step'] = function(b) {
    const d = b.getFieldValue('DIR');
    return `await calculateSpiderGait('${d}');\n`;
};

Blockly.Blocks['spider_walk_while'] = {
    init: function() {
        this.appendValueInput("COND").setCheck("Boolean").appendField("🔄 Йти").appendField(new Blockly.FieldDropdown([["Вперед ⬆️", "FWD"], ["Назад ⬇️", "BWD"], ["Вліво ⬅️", "LEFT"], ["Вправо ➡️", "RIGHT"]]), "DIR").appendField("поки");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_walk_while'] = function(b) {
    const d = b.getFieldValue('DIR');
    const cond = javascript.javascriptGenerator.valueToCode(b, 'COND', javascript.Order.ATOMIC) || 'false';
    return `
    while(${cond}) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        await calculateSpiderGait('${d}');
    }
    \n`;
};

Blockly.Blocks['spider_walk_time'] = {
    init: function() {
        this.appendValueInput("SEC").setCheck("Number").appendField("⏱️ Йти").appendField(new Blockly.FieldDropdown([["Вперед ⬆️", "FWD"], ["Назад ⬇️", "BWD"], ["Вліво ⬅️", "LEFT"], ["Вправо ➡️", "RIGHT"]]), "DIR").appendField("протягом (сек)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_walk_time'] = function(b) {
    const d = b.getFieldValue('DIR');
    const s = javascript.javascriptGenerator.valueToCode(b, 'SEC', javascript.Order.ATOMIC) || '1';
    return `
    var _endT = new Date().getTime() + ${s}*1000;
    while(new Date().getTime() < _endT) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        await calculateSpiderGait('${d}');
    }
    \n`;
};

Blockly.Blocks['spider_config'] = {
    init: function() {
        this.appendDummyInput().appendField("🛠️ Налаштувати ходу");
        this.appendValueInput("HEIGHT").setCheck("Number").appendField("Висота кроку");
        this.appendValueInput("SPEED").setCheck("Number").appendField("Швидкість %");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_config'] = function(b) {
    const h = javascript.javascriptGenerator.valueToCode(b, 'HEIGHT', javascript.Order.ATOMIC) || '30';
    const s = javascript.javascriptGenerator.valueToCode(b, 'SPEED', javascript.Order.ATOMIC) || '100';
    return `_spiderHeight = ${h}; _spiderDelay = Math.max(10, 200 - ${s});\n`;
};

Blockly.Blocks['spider_leg_control'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🦵 Нога №")
            .appendField(new Blockly.FieldNumber(1, 1, 4), "LEG")
            .appendField(new Blockly.FieldDropdown([["Підняти ⬆️", "UP"], ["Опустити ⬇️", "DOWN"], ["Повернути ↔️", "TURN"]]), "ACTION");
        this.appendValueInput("VAL").setCheck("Number").appendField("Значення");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_leg_control'] = function(b) {
    const leg = b.getFieldValue('LEG');
    const act = b.getFieldValue('ACTION');
    const val = javascript.javascriptGenerator.valueToCode(b, 'VAL', javascript.Order.ATOMIC) || '90';
    return `await spiderLegAction(${leg}, '${act}', ${val});\n`;
};

Blockly.Blocks['spider_turn_smooth'] = {
    init: function() {
        this.appendValueInput("ANGLE").setCheck("Number").appendField("🔄 Плавний розворот на (град)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_turn_smooth'] = function(b) {
    const ang = javascript.javascriptGenerator.valueToCode(b, 'ANGLE', javascript.Order.ATOMIC) || '90';
    return `
    var steps = Math.abs(${ang}) / 15; 
    var dir = ${ang} > 0 ? 'TURN_R' : 'TURN_L';
    for(var i=0; i<steps; i++) {
        await calculateSpiderGait(dir);
    }
    \n`;
};

Blockly.Blocks['spider_anim'] = {
    init: function() {
        this.appendDummyInput().appendField("🎭 Анімація:")
            .appendField(new Blockly.FieldDropdown([["👋 Помахати", "WAVE"], ["🧎 Сісти", "SIT"], ["💃 Танець", "DANCE"], ["😤 Віджатись", "PUSHUP"]]), "ANIM");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_anim'] = function(b) {
    const a = b.getFieldValue('ANIM');
    return `await spiderAnimation('${a}');\n`;
};

Blockly.Blocks['spider_joystick_ctrl'] = {
    init: function() {
        this.appendDummyInput().appendField("🎮 Управління джойстиком -> Кроки");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260);
    }
};
javascript.javascriptGenerator.forBlock['spider_joystick_ctrl'] = function() {
    return `
    console.log("Joystick Control Started");
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        var jx = window.lastJoyX || 0;
        var jy = window.lastJoyY || 0;
        if (Math.abs(jx) > 20 || Math.abs(jy) > 20) {
            var dir = 'FWD';
            if (Math.abs(jx) > Math.abs(jy)) { dir = jx > 0 ? 'RIGHT' : 'LEFT'; }
            else { dir = jy > 0 ? 'FWD' : 'BWD'; }
            await calculateSpiderGait(dir);
        } else {
            await new Promise(r => setTimeout(r, 100));
        }
    }
    \n`;
};

Blockly.Blocks['spider_stop'] = { init: function() { this.appendDummyInput().appendField("🛑 Стоп / Заморозити"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(0); } };
javascript.javascriptGenerator.forBlock['spider_stop'] = function() { return `await sendSpiderPacket(90,90,90,90,90,90,90,90);\n`; };
