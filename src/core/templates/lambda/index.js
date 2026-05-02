// Placeholder Lambda handler shipped by Launch Platform.
// Replace with your real code by setting recommendation.config.codeUri to an
// S3 object, or by copying your build output to <artifactDir>/lambda_src/.

exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Hello from Launch Platform — replace this placeholder.",
      event: event ?? null,
      timestamp: new Date().toISOString(),
    }),
  };
};
