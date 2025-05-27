import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import * as pdfParse from "pdf-parse";

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

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let cvText = "";

    if (file.type === "application/pdf") {
      try {
        const pdfData = await pdfParse(buffer);
        cvText = pdfData.text;
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        return NextResponse.json(
          { error: "Failed to parse PDF file" },
          { status: 400 }
        );
      }
    } else if (
      file.name.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      try {
        const docxData = await mammoth.extractRawText({ buffer });
        cvText = docxData.value;
      } catch (docxError) {
        console.error("DOCX parsing error:", docxError);
        return NextResponse.json(
          { error: "Failed to parse DOCX file" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload PDF or DOCX." },
        { status: 400 }
      );
    }

    if (!cvText.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from the uploaded file" },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key is not configured" },
        { status: 500 }
      );
    }

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
                  text: `Here is a CV:\n\n${cvText}\n\nHere is the job description:\n\n${jobDescription}\n\nPlease tailor the CV to match the job description. Focus on highlighting relevant skills and experiences that align with the job requirements.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini API error:", errorText);
      return NextResponse.json(
        { error: "Failed to process CV with AI", details: errorText },
        { status: 500 }
      );
    }

    const geminiData = await geminiRes.json();

    const modifiedCV =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No content returned";

    if (modifiedCV === "No content returned") {
      return NextResponse.json(
        { error: "Failed to generate modified CV" },
        { status: 500 }
      );
    }

    return new NextResponse(modifiedCV, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="modified_cv.txt"`,
      },
    });
  } catch (error: any) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
