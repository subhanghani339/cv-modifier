"use client";

import React, { useState } from "react";

export default function CVModifier() {
  const [jobDescription, setJobDescription] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cvModified, setCvModified] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFileName(uploadedFile.name);
      setFile(uploadedFile);
    }
  };

  const handleModifyCV = async () => {
    if (!file || !jobDescription) return;

    const formData = new FormData();
    formData.append("cvFile", file);
    formData.append("jobDescription", jobDescription);

    const res = await fetch("/api/modify-cv", {
      method: "POST",
      body: formData,
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "modified_cv";
    a.click();

    setCvModified(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white p-6 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-6 text-center">Modify CV</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-lg font-medium mb-2">
              Paste Job Description
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={10}
              placeholder="Paste the job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            ></textarea>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <label className="block text-lg font-medium mb-2">
                Upload Your CV (PDF or DOCX)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  className="border rounded-lg px-4 py-2 w-full cursor-pointer"
                />
              </div>
              {fileName && (
                <p className="mt-2 text-sm text-gray-600">
                  Uploaded: {fileName}
                </p>
              )}
            </div>

            <button
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-xl font-semibold transition duration-200"
              onClick={handleModifyCV}
              disabled={!jobDescription || !file}
            >
              Modify CV
            </button>
          </div>
        </div>

        {cvModified && (
          <div className="mt-8 border-t pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Download Modified CV</h2>
            <p className="text-green-600 font-medium">
              Download will start automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
