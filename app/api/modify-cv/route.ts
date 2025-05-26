import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";

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
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = pdfDoc.getPages();
      const texts: string[] = [];

      for (const page of pages) {
        // const textContent = await page.getTextContent(); // ⚠️ Not available in pdf-lib
        texts.push("PDF parsing is limited in pdf-lib. Use pdf-text-extract or PDF.js for better results.");
        break;
      }

      cvText = texts.join("\n");
    } else if (
      file.name.endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const docxData = await mammoth.extractRawText({ buffer });
      cvText = docxData.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload PDF or DOCX." },
        { status: 400 }
      );
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
        console.log(errorText, "geminiRes")
      return NextResponse.json(
        { error: "Failed to fetch from Gemini API", details: errorText },
        { status: 500 }
      );
    }

    const geminiData = await geminiRes.json();
    const modifiedCV =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No content returned";

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
