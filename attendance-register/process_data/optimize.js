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

async function cal_total_hours_per_student(course_id, user_id, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  try {
    const response = await axios({
      method: "GET",
      url: `https://glow.paclinks.org/mod/attendanceregister/view.php?a=${course_id}&userid=${user_id}`,
      headers: {
        Cookie: `MoodleSession=${MOODLE_SESSION}; MOODLEID1_=${MOODLEID1_}`,
      },
      timeout: 30000, // 30 seconds timeout
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
  } catch (error) {
    console.error(`${chalk.red("Error fetching data:")} ${error.message} for course ${course_id} and user ${user_id}`);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`${chalk.yellow("Retrying")} (${retryCount + 1}/${MAX_RETRIES}) in ${RETRY_DELAY/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return cal_total_hours_per_student(course_id, user_id, retryCount + 1);
    }
    
    console.error(`${chalk.red("Max retries reached")} for course ${course_id} and user ${user_id}`);
    return 0;
  }
}

async function updateStudentStatus(pals_id) {
  const jsonFilePath = './process_data/base_data.json';
  const data = JSON.parse(await fs.readFile(jsonFilePath, 'utf8'));
  
  // Find and update the student's status
  const studentIndex = data.findIndex(student => student.PALS_ID === pals_id);
  if (studentIndex !== -1) {
    data[studentIndex].CHECKED = "true";
    await fs.writeFile(jsonFilePath, JSON.stringify(data, null, 2));
  }
}

async function processStudent(student, csvParser, fileName) {
  const user_id = student.USER_ID;
  const user_name = student.FULLNAME;
  const pals_id = student.PALS_ID;

  console.log(`${chalk.blue("Processing student:")} ${chalk.magenta(user_name)} (${chalk.green(pals_id)})`);

  let total_hours = 0.0;
  const courseHours = {};

  // Process all courses concurrently for each student
  const coursePromises = course_data.map(async (course) => {
    const { course_id, course_name } = course;
    const hours = await cal_total_hours_per_student(course_id, user_id);
    return { course_name, hours };
  });

  const courseResults = await Promise.all(coursePromises);

  // Aggregate results
  for (const result of courseResults) {
    courseHours[result.course_name] = result.hours.toFixed(2);
    total_hours += Number(result.hours);

    console.log(
      `==> ${chalk.blue("Course")} ${chalk.green(result.course_name)}, ` +
      `${chalk.blue("Student:")} ${chalk.magenta(user_name)}, ` +
      `${chalk.blue("Total Time:")} ${chalk.yellow(result.hours.toFixed(2))} hours`
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
  
  // Update student's CHECKED status
  await updateStudentStatus(pals_id);

  console.log(
    `${chalk.blue("Data appended for")} ${chalk.green(user_name)} and marked as processed`
  );
}

async function script() {
  const exportDir = './export';
  const fileName = `${exportDir}/T${MONTH}_OPT_REPORT.csv`;

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
  const uncheckedStudents = student_data.filter(student => Boolean(student.CHECKED) == false);
  
  console.log(`${chalk.blue("Total students to process:")} ${chalk.yellow(uncheckedStudents.length)}`);
  
  if (uncheckedStudents.length === 0) {
    console.log(chalk.green("No students with CHECKED: false found. All students have been processed."));
    return;
  }

  // Process students in smaller batches with delay between batches
  const BATCH_SIZE = 5; // Reduced batch size
  const BATCH_DELAY = 1000; // 5 seconds delay between batches
  
  for (let i = 0; i < uncheckedStudents.length; i += BATCH_SIZE) {
    const batch = uncheckedStudents.slice(i, i + BATCH_SIZE);
    try {
      await Promise.all(
        batch.map(student => processStudent(student, csvParser, fileName))
      );
      console.log(`${chalk.blue("Completed batch")} ${chalk.yellow(Math.floor(i / BATCH_SIZE) + 1)} of ${Math.ceil(uncheckedStudents.length / BATCH_SIZE)}`);
      
      // Add delay between batches
      if (i + BATCH_SIZE < uncheckedStudents.length) {
        console.log(`${chalk.blue("Waiting")} ${BATCH_DELAY/1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    } catch (error) {
      console.error(`${chalk.red("Error processing batch:")} ${error.message}`);
      // Continue with next batch even if current batch fails
    }
  }
}


script();
