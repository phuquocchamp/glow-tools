import axios from "axios";
import * as cheerio from "cheerio";
import course_data from "../course_data.json" with { type: "json" };
import chalk from "chalk";

const MOODLE_SESSION = process.env.MOODLE_SESSION;
const MOODLEID1_ = process.env.MOODLEID1_;

if (!MOODLE_SESSION || !MOODLEID1_) {
  console.error("Error: MOODLE_SESSION or MOODLEID1_ is not defined in .env");
  process.exit(1);
}

async function refresh_tool() {
  for (const course of course_data) {
    if (course.refresh) continue;
    const course_id = course.course_id;
    const course_name = course.course_name;
    console.log(chalk.blue(`Refreshing course ${course_id} : ${course_name}`));
    const response = await axios({
      method: "GET",
      url: `https://glow.paclinks.org/mod/attendanceregister/view.php?a=${course_id}&action=recalc`,
      headers: {
        Cookie: `MoodleSession=${MOODLE_SESSION}; MOODLEID1_=${MOODLEID1_}`,
      },
    });
  
    if (response.status === 200) {
      console.log(chalk.green("Refresh course successfully"));
    } else {
      console.log(chalk.red("Refresh course failed"));
    }
  }
}



refresh_tool();
