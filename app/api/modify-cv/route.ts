// app/api/modify-cv/route.ts

import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("cvFile") as File | null;
    const jobDescription = formData.get("jobDescription") as string | null;

    if (!file || !jobDescription) {
      return NextResponse.json(
        { error: "Missing file or job description" },
        { status: 400 }
      );
    }

    // Read uploaded file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let cvText = "";

    // Extract text from uploaded file
    if (file.type === "application/pdf") {
      const pdfData = await pdfParse(buffer);
      cvText = pdfData.text;
    } else if (
      file.name.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessing.document"
    ) {
      const docxData = await mammoth.extractRawText({ buffer });
      cvText = docxData.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload PDF or DOCX." },
        { status: 400 }
      );
    }

    // Generate a tailored CV using Gemini
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

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return NextResponse.json(
        { error: "Failed to fetch from Gemini API", details: errorText },
        { status: 500 }
      );
    }

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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
