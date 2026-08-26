export default function Home() {
  return (
    <main className="portfolio-shell">
      <iframe
        className="portfolio-frame"
        src="/portfolio/index.html"
        title="Riju Das research portfolio"
      />
      <noscript>
        <p>
          This portfolio is available at <a href="/portfolio/index.html">the static site</a>.
        </p>
      </noscript>
    </main>
  );
}
