// pages/api/swagger.js
export default function handler(req, res) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Swagger UI - Products API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4/swagger-ui.css" />
  <style>body { margin:0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
      window.ui = ui;
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
