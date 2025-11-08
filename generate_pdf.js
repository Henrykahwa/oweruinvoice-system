const puppeteer = require('puppeteer');
const express = require('express');
const app = express();

app.get('/generate-pdf/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Assuming the HTML is generated similarly to generateReportHTML
  // For simplicity, we'll use a placeholder URL; in real implementation, generate the HTML content
  const htmlContent = generateHTMLForDocument(type, id); // Implement this function

  await page.setContent(htmlContent);
  const pdfBuffer = await page.pdf({ format: 'A4' });

  await browser.close();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${type}_${id}.pdf`);
  res.send(pdfBuffer);
});

function generateHTMLForDocument(type, id) {
  // Fetch data from database and generate HTML similar to generateReportHTML
  // This is a placeholder; implement based on your data fetching logic
  return `
    <html>
      <body>
        <h1>${type.toUpperCase()} #${id}</h1>
        <p>Generated PDF for ${type} ID: ${id}</p>
      </body>
    </html>
  `;
}

app.listen(3001, () => {
  console.log('PDF Generator running on port 3001');
});
