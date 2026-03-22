import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { setLocalVariable } from '../../../variables.js';

async function dbGetHandler(args, value) {
    const fetchUrl = args.url;
    const varName = args.var;

    if (!fetchUrl) {
        toastr.error("กรุณาระบุ URL (เช่น url=http://127.0.0.1:8000/data)", "DB Connector: Error");
        return "";
    }

    if (!varName) {
        toastr.error("กรุณาระบุชื่อตัวแปรที่ต้องการบันทึก (เช่น var=my_data)", "DB Connector: Error");
        return "";
    }

    try {
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        const data = await response.json();
        const dataString = JSON.stringify(data);

        // บันทึกลงใน Local Variable ของ SillyTavern
        setLocalVariable(varName, dataString);

        toastr.success(`ข้อมูลถูกบันทึกลงในตัวแปร: ${varName} เรียบร้อยแล้ว`, "DB Connector: Success");
        return dataString;

    } catch (error) {
        console.error("[World DB Connector] Error fetching data:", error);
        toastr.error(`เชื่อมต่อ API ล้มเหลว: ${error.message}`, "DB Connector: Offline!");
        return "";
    }
}

jQuery(async () => {
    const dbGetCommand = new SlashCommand('db-fetch', dbGetHandler)
        .help('ดึงข้อมูล JSON จาก URL ที่ระบุแล้วบันทึกค่าเก็บไว้เป็น Variable')
        .addNamedArgument('url', 'API URL ที่ต้องการดึงข้อมูล')
        .addNamedArgument('var', 'ชื่อตัวแปรรองรับข้อมูลในรูปแบบ JSON (เมื่อเรียกใช้ให้เข้าถึงผ่าน {{getvar::ชื่อตัวแปร}})');

    SlashCommandParser.addCommandObject(dbGetCommand);

    console.log("[World DB Connector] Extension Loaded Successfully! (/db-get command registered)");
});
