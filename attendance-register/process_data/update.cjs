const fs = require("fs");
const path = require("path");

try {
  // Read the base_data.json file
  const filePath = path.join(__dirname, "base_data.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Add CHECKED: true to each object
  const updatedData = data.map((item) => ({
    ...item,
    CHECKED: true,
  }));

  // Write the updated data back to the file
  fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), "utf8");

  console.log(
    `Successfully added CHECKED: true to ${updatedData.length} objects in base_data.json`
  );
} catch (error) {
  console.error("Error updating file:", error);
}
