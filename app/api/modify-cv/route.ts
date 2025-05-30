import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PDFParser from "pdf2json";

function extractTextFromPdf(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (errData: any) => {
      reject(errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      try {
        const pages = pdfData.Pages;

        const fullText = pages
          .map((page: any) =>
            page.Texts.map((textObj: any) =>
              textObj.R.map((r: any) => decodeURIComponent(r.T)).join("")
            ).join(" ")
          )
          .join("\n\n");

        console.log(fullText, "fullText");

        resolve(fullText.trim());
      } catch (err) {
        reject("Failed to parse text from PDF data.");
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

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

    const isPDF = file.type === "application/pdf";
    const isDOCX =
      file.name.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    let cvText = "";

    if (isPDF) {
      try {
        cvText = await extractTextFromPdf(buffer);
      } catch (err) {
        console.error("PDF parsing failed:", err);
        cvText =
          "[Warning] PDF parsing failed. Consider using DOCX for better results.";
      }
    } else if (isDOCX) {
      const docxData = await mammoth.extractRawText({ buffer });
      cvText = docxData.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload PDF or DOCX." },
        { status: 400 }
      );
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    const modifiedText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No content returned";

    let outputBuffer: Buffer;
    let contentType: string;
    let downloadName: string;

    if (isPDF) {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 10;
      const textLines = modifiedText.split("\n");

      const pageWidth = 595.28;
      const pageHeight = 841.89;

      let y = pageHeight - 20;
      for (const line of textLines) {
        if (y < 20) {
          y = page.getHeight() - 20;
          page.drawText("...", { x: 50, y, size: fontSize, font });
          break;
        }
        page.drawText(line, { x: 50, y, size: fontSize, font });
        y -= 14;
      }

      outputBuffer = Buffer.from(await pdfDoc.save());
      contentType = "application/pdf";
      downloadName = "modified_cv.pdf";
    } else {
      outputBuffer = Buffer.from(modifiedText, "utf-8");
      contentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      downloadName = "modified_cv.docx";
    }

    return new NextResponse(outputBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${downloadName}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
