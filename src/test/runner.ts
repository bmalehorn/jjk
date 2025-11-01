import path from "path";
import Mocha from "mocha";

export function run(
  testsRoot: string, // This will be out/test/runner.js
  cb: (error: unknown, failures?: number) => void,
): void {
  const mocha = new Mocha({
    ui: "tdd",
    timeout: 30_000,
  });

  const mochaGrep = process.env.MOCHA_GREP;
  if (mochaGrep) {
    const flags = process.env.MOCHA_GREP_FLAGS ?? "";
    try {
      const grepRegex = new RegExp(mochaGrep, flags);
      mocha.grep(grepRegex);
      const invertFlag = process.env.MOCHA_GREP_INVERT?.toLowerCase();
      if (invertFlag === "1" || invertFlag === "true") {
        mocha.invert();
      }
    } catch (error) {
      console.error(
        `Invalid MOCHA_GREP pattern ${JSON.stringify(mochaGrep)}.`,
        error,
      );
      throw error;
    }
  }

  // Path to the bundled file containing all tests
  const allTestsBundlePath = path.resolve(
    path.dirname(testsRoot),
    "all-tests.js",
  );

  mocha.addFile(allTestsBundlePath);

  try {
    mocha.run((failures) => {
      cb(null, failures);
    });
  } catch (err) {
    console.error("Error running Mocha tests:", err);
    cb(err);
  }
}
