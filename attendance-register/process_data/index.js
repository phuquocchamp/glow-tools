import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import { Parser } from "json2csv";
import course_data from "../course_data.json" with { type: "json" };
import student_data from "./base_data.json" with { type: "json" };
import chalk from "chalk";

const MOODLE_SESSION = process.env.MOODLE_SESSION;
const MOODLEID1_ = process.env.MOODLEID1_;
const MONTH = process.env.MONTH;

if (!MOODLE_SESSION || !MOODLEID1_ || !MONTH) {
  console.error("Error: MOODLE_SESSION, MOODLEID1_, or MONTH is not defined in .env");
  process.exit(1);
}

function convertDurationToHours(duration) {
  const parts = duration.trim().split(/[\s,]+/);
  let hours = 0;
  let minutes = 0;
  if (parts.includes("h")) {
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[2]);
  } else {
    minutes = parseInt(parts[0]);
  }
  return (hours + minutes / 60).toFixed(2);
}

async function cal_total_hours_per_student(course_id, user_id) {
  const response = await axios({
    method: "GET",
    url: `https://glow.paclinks.org/mod/attendanceregister/view.php?a=${course_id}&userid=${user_id}`,
    headers: {
      Cookie: `MoodleSession=${MOODLE_SESSION}; MOODLEID1_=${MOODLEID1_}`,
    },
  });

  const $ = cheerio.load(response.data);
  const rows = $(".attendanceregister_evenrow, .attendanceregister_oddrow");

  let total_time = 0;
  rows.each((index, element) => {
    const cells = $(element).find("td");
    if (cells.length !== 0) {
      const startDate = new Date($(cells[1]).text().trim());
      const endDate = new Date($(cells[2]).text().trim());
      const duration = convertDurationToHours($(cells[3]).text().trim());

      if (
        startDate.getMonth() + 1 === parseInt(MONTH) &&
        startDate.getFullYear() === 2025 
      ) {
        if (Number(duration) <= 8) {
          total_time += Number(duration);
        } 
      }
    }
  });

  return total_time;
}

async function script() {
  const exportDir = './export';
  const fileName = `${exportDir}/T${MONTH}_REPORT.csv`;

  // Ensure the export directory exists
  try {
    await fs.access(exportDir);
  } catch {
    await fs.mkdir(exportDir, { recursive: true });
  }

  // Define fields: basic fields + each course name
  const basicFields = ["PALS_ID", "USER_ID", "NAME", "TOTAL_HOURS"];
  const courseFields = course_data.map(course => course.course_name);
  const allFields = [...basicFields, ...courseFields];
  
  const csvParser = new Parser({ fields: allFields, header: false });

  // Create file and header if not exists
  try {
    await fs.access(fileName);
  } catch {
    const headerParser = new Parser({ fields: allFields });
    await fs.writeFile(fileName, headerParser.parse([]));
  }

  // Filter students with CHECKED: false
  const uncheckedStudents = student_data.filter(student => student.CHECKED === Boolean(false));
  
  console.log(`${chalk.blue("Total students to process:")} ${chalk.yellow(uncheckedStudents.length)}`);
  
  if (uncheckedStudents.length === 0) {
    console.log(chalk.green("No students with CHECKED: false found. All students have been processed."));
    return;
  }

  for (const student of uncheckedStudents) {
    const user_id = student.USER_ID;
    const user_name = student.FULLNAME;
    const pals_id = student.PALS_ID;

    console.log(`${chalk.blue("Processing student:")} ${chalk.magenta(user_name)} (${chalk.green(pals_id)})`);

    let total_hours = 0.0;
    const courseHours = {};

    for (const course of course_data) {
      const { course_id, course_name } = course;
      const hours = await cal_total_hours_per_student(course_id, user_id);
      
      courseHours[course_name] = hours.toFixed(2);
      total_hours += Number(hours);

      console.log(
        `==> ${chalk.blue("Course")} ${chalk.green(course_name)}, ` +
        `${chalk.blue("Student:")} ${chalk.magenta(user_name)}, ` +
        `${chalk.blue("Total Time:")} ${chalk.yellow(hours.toFixed(2))} hours`
      );
    }

    console.log(
      `${chalk.blue("PALS ID:")} ${chalk.green(pals_id)}, ` +
      `${chalk.blue("Student:")} ${chalk.magenta(user_name)}, ` +
      `${chalk.blue("Total Time:")} ${chalk.yellow(total_hours.toFixed(2))} hours`
    );

    // Compose the full record
    const user_data = {
      PALS_ID: pals_id,
      USER_ID: user_id,
      NAME: user_name,
      TOTAL_HOURS: total_hours.toFixed(2),
      ...courseHours
    };

    const csvLine = csvParser.parse([user_data]);
    await fs.appendFile(fileName, "\n" + csvLine);

    console.log(
      `${chalk.blue("Data appended for")} ${chalk.green(user_name)}`
    );
  }
}

script();
