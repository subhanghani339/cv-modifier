import { NextRequest, NextResponse } from "next/server";
import { File } from "formidable";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const config = {
  api: {
    bodyParser: false,
  },
};

// Utility to parse multipart form
async function parseForm(
  req: NextRequest
): Promise<{ fields: any; files: any }> {
  const data = await req.formData();

  const file = data.get("cvFile") as unknown as File;
  const jobDescription = data.get("jobDescription") as string;

  return {
    fields: { jobDescription },
    files: { cvFile: file },
  };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("cvFile") as File;
  const jobDescription = formData.get("jobDescription") as string;

  if (!file || !jobDescription) {
    return NextResponse.json(
      { error: "Missing file or job description" },
      { status: 400 }
    );
  }

  // Read file into Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let cvText = "";
  try {
    if (file.type === "application/pdf") {
      const result = await pdfParse(buffer);
      cvText = result.text;
    } else if (file.name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      cvText = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to extract text" },
      { status: 500 }
    );
  }

  // Call Gemini API
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Here is a CV:\n\n${cvText}\n\nHere is the job description:\n\n${jobDescription}\n\nPlease tailor the CV to match the job description.`,
              },
            ],
          },
        ],
      }),
    }
  );

  const geminiData = await geminiRes.json();
  const modifiedCV =
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No content returned";

  return new NextResponse(modifiedCV, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="modified_cv.txt"`,
    },
  });
}
