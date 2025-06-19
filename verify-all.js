#!/usr/bin/env node

/**
 * Comprehensive JS vs Perl Output Verification
 * Node.js replacement for verify-all.sh with added statistics
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const filter = false;
class VerificationRunner {
  constructor() {
    this.workingDir = "/home/dali/netisse/carto";
    this.results = [];
    this.stats = {
      totalFiles: 0,
      perfectMatches: 0,
      filesWithDifferences: 0,
      missingFiles: 0,
      errors: 0,
      totalComparisons: 0,
      totalDifferences: 0,
    };
  }

  /**
   * Print header
   */
  printHeader() {
    console.log("🚀 Comprehensive JS vs Perl Output Verification");
    console.log("=".repeat(50));
    console.log("");
  }

  /**
   * Get list of available test files from pl-output directory
   */
  getAvailableFiles() {
    console.log("🔍 Finding available test files...");

    const plDir = path.join(this.workingDir, "pl-output");

    if (!fs.existsSync(plDir)) {
      console.error("❌ No Perl output files found in pl-output/");
      process.exit(1);
    }

    const files = fs
      .readdirSync(plDir)
      .filter((file) => file.endsWith(".json") && (filter || file.startsWith("LYS") || file.startsWith("BRU")))
      .map((file) => file.replace(".json", ""))
      .sort();

    if (files.length === 0) {
      console.error("❌ No JSON files found in pl-output/");
      process.exit(1);
    }

    console.log(
      `📁 Found ${files.length} files: ${files.slice(0, 5).join(", ")}${
        files.length > 5 ? "..." : ""
      }`
    );
    console.log("");

    return files;
  }

  /**
   * Test a single file pair
   */
  testFile(fileBase) {
    console.log("📋 Testing:", fileBase);
    console.log("-".repeat(40));

    const jsFile = path.join(this.workingDir, "js-output", `${fileBase}.json`);
    const plFile = path.join(this.workingDir, "pl-output", `${fileBase}.json`);

    const result = {
      file: fileBase,
      status: "unknown",
      perfectMatch: false,
      differences: 0,
      comparisons: 0,
      matchRate: 0,
      error: null,
    };

    // Check if both files exist
    if (!fs.existsSync(jsFile) || !fs.existsSync(plFile)) {
      console.log("❌ Missing files for", fileBase);
      if (!fs.existsSync(jsFile)) {
        console.log(`   Missing: js-output/${fileBase}.json`);
      }
      if (!fs.existsSync(plFile)) {
        console.log(`   Missing: pl-output/${fileBase}.json`);
      }

      result.status = "missing";
      this.stats.missingFiles++;
      this.results.push(result);
      return result;
    }

    try {
      const improved = false; // Use improved comparison script
      // Run the smart-compare.js script
      const compareScript = path.join(
        this.workingDir,
        improved ? "smart-compare-improved.js" :
        path.join("svg-to-json-converter", "smart-compare.js")
      );
      const output = execSync(
        `node "${compareScript}" "${jsFile}" "${plFile}"`,
        {
          encoding: "utf8",
          cwd: this.workingDir,
        }
      );

      console.log(output);

      // Parse the output to extract statistics
      const lines = output.split("\n");
      let perfectMatch = false;
      let differences = 0;
      let comparisons = 0;
      let matchRate = 0;

      for (const line of lines) {
        if (line.includes("✅ PERFECT MATCH!")) {
          perfectMatch = true;
        } else if (
          line.includes("❌ Found") &&
          line.includes("meaningful difference")
        ) {
          const match = line.match(/Found (\d+) meaningful difference/);
          if (match) {
            differences = parseInt(match[1]);
          }
        } else if (line.includes("Total comparisons:")) {
          const match = line.match(/Total comparisons: (\d+)/);
          if (match) {
            comparisons = parseInt(match[1]);
          }
        } else if (line.includes("Match rate:")) {
          const match = line.match(/Match rate: ([\d.]+)%/);
          if (match) {
            matchRate = parseFloat(match[1]);
          }
        }
      }

      result.status = "success";
      result.perfectMatch = perfectMatch;
      result.differences = differences;
      result.comparisons = comparisons;
      result.matchRate = matchRate;

      if (perfectMatch) {
        this.stats.perfectMatches++;
      } else {
        this.stats.filesWithDifferences++;
      }

      this.stats.totalComparisons += comparisons;
      this.stats.totalDifferences += differences;
    } catch (error) {
      console.log("❌ Error testing", fileBase + ":", error.message);
      result.status = "error";
      result.error = error.message;
      this.stats.errors++;
    }

    this.results.push(result);
    return result;
  }

  /**
   * Calculate and display comprehensive statistics
   */
  calculateAverages() {
    console.log("");
    console.log("🏁 Comprehensive verification completed!");
    console.log("");
    console.log("📊 DETAILED STATISTICS:");
    console.log("=".repeat(50));

    // Basic counts
    console.log(`📁 Total files processed:        ${this.stats.totalFiles}`);
    console.log(
      `✅ Perfect matches:              ${this.stats.perfectMatches}`
    );
    console.log(
      `⚠️  Files with differences:      ${this.stats.filesWithDifferences}`
    );
    console.log(`❌ Missing files:                ${this.stats.missingFiles}`);
    console.log(`💥 Errors:                       ${this.stats.errors}`);
    console.log("");

    // Success rates
    const successfulTests =
      this.stats.totalFiles - this.stats.missingFiles - this.stats.errors;
    const perfectMatchRate =
      successfulTests > 0
        ? (this.stats.perfectMatches / successfulTests) * 100
        : 0;
    const overallSuccessRate =
      this.stats.totalFiles > 0
        ? (successfulTests / this.stats.totalFiles) * 100
        : 0;

    console.log("📈 SUCCESS RATES:");
    console.log(
      `   Perfect match rate:           ${perfectMatchRate.toFixed(2)}%`
    );
    console.log(
      `   Overall success rate:         ${overallSuccessRate.toFixed(2)}%`
    );
    console.log("");

    // Comparison statistics
    console.log("🔍 COMPARISON STATISTICS:");
    console.log(
      `   Total comparisons made:       ${this.stats.totalComparisons.toLocaleString()}`
    );
    console.log(
      `   Total differences found:      ${this.stats.totalDifferences.toLocaleString()}`
    );

    if (this.stats.totalComparisons > 0) {
      const overallMatchRate =
        ((this.stats.totalComparisons - this.stats.totalDifferences) /
          this.stats.totalComparisons) *
        100;
      console.log(
        `   Overall match rate:           ${overallMatchRate.toFixed(6)}%`
      );
    }
    console.log("");

    // Averages per file
    if (successfulTests > 0) {
      const avgComparisons = this.stats.totalComparisons / successfulTests;
      const avgDifferences = this.stats.totalDifferences / successfulTests;

      console.log("📊 AVERAGES PER FILE:");
      console.log(
        `   Average comparisons per file: ${avgComparisons.toFixed(2)}`
      );
      console.log(
        `   Average differences per file: ${avgDifferences.toFixed(2)}`
      );
      console.log("");
    }

    // File-specific statistics
    const successfulResults = this.results.filter(
      (r) => r.status === "success"
    );
    if (successfulResults.length > 0) {
      const matchRates = successfulResults
        .map((r) => r.matchRate)
        .filter((rate) => rate > 0);

      if (matchRates.length > 0) {
        const avgMatchRate =
          matchRates.reduce((sum, rate) => sum + rate, 0) / matchRates.length;
        const minMatchRate = Math.min(...matchRates);
        const maxMatchRate = Math.max(...matchRates);

        console.log("🎯 MATCH RATE STATISTICS:");
        console.log(
          `   Average match rate:           ${avgMatchRate.toFixed(6)}%`
        );
        console.log(
          `   Best match rate:              ${maxMatchRate.toFixed(6)}%`
        );
        console.log(
          `   Worst match rate:             ${minMatchRate.toFixed(6)}%`
        );
        console.log("");
      }
    }

    // Summary assessment
    console.log("📝 OVERALL ASSESSMENT:");
    if (this.stats.perfectMatches === successfulTests && successfulTests > 0) {
      console.log("   🎉 EXCELLENT! All files show perfect matches.");
      console.log(
        "   ✅ The JS implementation is functionally identical to Perl."
      );
    } else if (perfectMatchRate >= 90) {
      console.log("   🟢 VERY GOOD! Most files show perfect matches.");
      console.log(
        "   ✅ The JS implementation is highly compatible with Perl."
      );
    } else if (perfectMatchRate >= 70) {
      console.log("   🟡 GOOD! Majority of files show perfect matches.");
      console.log("   ⚠️  Some differences found - review recommended.");
    } else if (perfectMatchRate >= 50) {
      console.log("   🟠 FAIR! About half the files show perfect matches.");
      console.log(
        "   ⚠️  Significant differences found - investigation needed."
      );
    } else {
      console.log("   🔴 POOR! Many files show differences.");
      console.log("   ❌ The JS implementation needs significant work.");
    }

    console.log("");
    console.log("💡 NOTES:");
    console.log(
      "   • Differences shown are meaningful (not tiny floating-point precision)"
    );
    console.log(
      "   • Float tolerance: 1e-10 (much larger than ~1e-14 precision differences)"
    );
    console.log('   • Any "PERFECT MATCH" indicates functional equivalence');
    console.log("");
    console.log("=".repeat(50));
  }

  /**
   * Export detailed results to JSON
   */
  exportResults() {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: this.stats,
      fileResults: this.results,
      configuration: {
        workingDirectory: this.workingDir,
        floatTolerance: "1e-10",
        coordinateTolerance: "1e-8",
      },
    };

    const reportFile = path.join(this.workingDir, "verification-report.json");
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    console.log(`📄 Detailed verification report exported to: ${reportFile}`);
  }

  /**
   * Run the complete verification process
   */
  run() {
    this.printHeader();

    // Change to working directory
    process.chdir(this.workingDir);

    const availableFiles = this.getAvailableFiles();
    this.stats.totalFiles = availableFiles.length;

    // Test each file
    for (const fileBase of availableFiles) {
      this.testFile(fileBase);
      console.log(""); // Add spacing between tests
    }

    // Calculate and display statistics
    this.calculateAverages();

    // Export detailed results
    this.exportResults();

    console.log("✅ Verification process completed successfully!");
  }
}

// Run the script if called directly
if (require.main === module) {
  const runner = new VerificationRunner();
  runner.run();
}

module.exports = VerificationRunner;
