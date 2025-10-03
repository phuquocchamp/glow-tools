import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import { Parser } from "json2csv";

const MOODLE_SESSION = process.env.MOODLE_SESSION;
const MOODLEID1_ = process.env.MOODLEID1_;

if (!MOODLE_SESSION || !MOODLEID1_) {
  console.error("Error: MOODLE_SESSION or MOODLEID1_ is not defined in .env");
  process.exit(1);
}

async function main() {
  const response = await axios({
    method: "GET",
    url: "https://glow.paclinks.org/mod/attendanceregister/view.php?a=5",
    headers: {
      Cookie: `MoodleSession=${MOODLE_SESSION}; MOODLEID1_=${MOODLEID1_}`,
    },
  });
  const $ = cheerio.load(response.data);
  const rows = $(".attendanceregister_evenrow, .attendanceregister_oddrow");
  const data = [];
  const regex = /[&]userid=(\d+)/;
  const regex_pals = /^[A-Z]{2}[0-9]{2}[A-Z]{1}[0-9]{4}/;

  rows.each((index, element) => {
    const student_id = $(element).find("a");
    const fullname = $(element).find("a").text().trim();
    const href = student_id.attr("href");

    const match = regex.exec(href);
    let USER_ID = null;
    if (match && match[1]) {
      USER_ID = match[1];
    }
    if (!USER_ID) return;

    const name_parts = fullname.split(" ");
    const PALS_ID = name_parts[0];
    const name = name_parts.slice(1).join(" ").trim();
    if (regex_pals.test(PALS_ID)) {
      data.push({ PALS_ID: `${PALS_ID}`, USER_ID: `${USER_ID}` });
    }
  });

  // Ghi dữ liệu vào file CSV (Excel)
  const fields = ["PALS_ID", "USER_ID"];
  const opts = { fields };

  try {
    const parser = new Parser(opts);
    const csv = parser.parse(data);

    fs.writeFileSync("./crawl_data/students_data.csv", csv);
    console.log("Dữ liệu đã được ghi vào file students_data.csv");
  } catch (err) {
    console.error("Đã xảy ra lỗi khi ghi file CSV:", err);
  }
}

main();
