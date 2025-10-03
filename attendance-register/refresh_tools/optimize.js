import axios from "axios";
import * as cheerio from "cheerio";
import course_data from "../course_data.json" with { type: "json" };
import chalk from "chalk";
import { promisify } from "util";
import { setTimeout } from "timers/promises";

const MOODLE_SESSION = process.env.MOODLE_SESSION;
const MOODLEID1_ = process.env.MOODLEID1_;
const CONCURRENCY_LIMIT = 3 ; // Giới hạn 3 request đồng thời
const REQUEST_DELAY = 500; // Delay 500ms giữa các batch

if (!MOODLE_SESSION || !MOODLEID1_) {
  console.error(chalk.red("Error: Missing Moodle credentials in .env"));
  process.exit(1);
}

async function refreshCourse(course) {
  const { course_id, course_name } = course;
  try {
    const response = await axios.get(
      `https://glow.paclinks.org/mod/attendanceregister/view.php`,
      {
        params: {
          a: course_id,
          action: "recalc"
        },
        headers: {
          Cookie: `MoodleSession=${MOODLE_SESSION}; MOODLEID1_=${MOODLEID1_}`,
        },
        timeout: 300000
      }
    );

    // Kiểm tra nội dung response
    const $ = cheerio.load(response.data);
    const successMessage = $(".alert-success").first().text().trim();
    
    return {
      course_id,
      success: true,
      message: successMessage || "Refresh triggered successfully"
    };
  } catch (error) {
    const errorMessage = error.response?.data 
      ? cheerio.load(error.response.data)('.alert-danger').first().text().trim()
      : error.message;
      
    return {
      course_id,
      success: false,
      message: errorMessage || "Unknown error occurred"
    };
  }
}

async function processBatch(batch) {
  const results = await Promise.all(batch.map(refreshCourse));
  
  // Xử lý kết quả batch
  results.forEach(({ course_id, success, message }) => {
    const logMessage = `[Course ${course_id}] ${message}`;
    console.log(
      success ? chalk.green(logMessage) : chalk.red(logMessage)
    );
  });
  
  return results;
}

async function refresh_tool() {
  console.log(chalk.cyan.bold(`Starting refresh for ${course_data.length} courses`));
  
  // Chia courses thành các batch nhỏ
  const batches = [];
  for (let i = 0; i < course_data.length; i += CONCURRENCY_LIMIT) {
    batches.push(course_data.slice(i, i + CONCURRENCY_LIMIT));
  }

  let successCount = 0;
  let errorCount = 0;
  
  try {
    for (const [index, batch] of batches.entries()) {
      if (index > 0) await setTimeout(REQUEST_DELAY);
      
      const batchResults = await processBatch(batch);
      batchResults.forEach(result => {
        result.success ? successCount++ : errorCount++;
      });
    }
    
    // Summary report
    console.log(chalk.yellow("\n--- Refresh Summary ---"));
    console.log(chalk.green(`Success: ${successCount}`));
    console.log(chalk.red(`Errors: ${errorCount}`));
    console.log(chalk.cyan(`Total: ${successCount + errorCount}`));
    
    return { successCount, errorCount };
  } catch (error) {
    console.error(chalk.red.bold("Fatal error during refresh:"), error);
    process.exit(1);
  }
}


async function refresh_tool_v2() {
  // Lọc các course có refresh: false
  const filteredCourses = course_data.filter(course => course.refresh === false);
  
  console.log(chalk.cyan.bold(`Starting refresh for ${filteredCourses.length} courses (refresh: false)`));

  // Chia courses thành các batch nhỏ
  const batches = [];
  for (let i = 0; i < filteredCourses.length; i += CONCURRENCY_LIMIT) {
    batches.push(filteredCourses.slice(i, i + CONCURRENCY_LIMIT));
  }

  let successCount = 0;
  let errorCount = 0;
  
  try {
    for (const [index, batch] of batches.entries()) {
      if (index > 0) await setTimeout(REQUEST_DELAY);
      
      const batchResults = await processBatch(batch);
      batchResults.forEach(result => {
        result.success ? successCount++ : errorCount++;
      });
    }
    
    // Summary report
    console.log(chalk.yellow("\n--- Refresh Summary ---"));
    console.log(chalk.green(`Success: ${successCount}`));
    console.log(chalk.red(`Errors: ${errorCount}`));
    console.log(chalk.cyan(`Total processed: ${successCount + errorCount}`));
    console.log(chalk.cyan(`Total eligible courses: ${filteredCourses.length}`));
    
    return { successCount, errorCount };
  } catch (error) {
    console.error(chalk.red.bold("Fatal error during refresh:"), error);
    process.exit(1);
  }
}


refresh_tool_v2();


// Chạy tool với xử lý lỗi tổng thể
refresh_tool_v2()
  .then(({ successCount, errorCount }) => {
    process.exit(errorCount > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error(chalk.red.bold("Unexpected error:"), error);
    process.exit(1);
  });