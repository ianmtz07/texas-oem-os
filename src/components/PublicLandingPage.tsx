import './PublicLandingPage.css'

export default function PublicLandingPage() {
  return (
    <main className="publicLanding">
      <header className="publicLandingHeader">
        <img
          className="publicLandingLogo"
          src="/branding/texas-oem-parts-logo.svg"
          alt="Texas OEM Parts"
        />
      </header>

      <section className="publicHero">
        <div className="publicHeroGlow" />

        <div className="publicHeroContent">
          <p className="publicEyebrow">TEXAS OEM PARTS</p>

          <h1>
            OEM USED AUTO PARTS.
            <span> DONE RIGHT.</span>
          </h1>

          <p className="publicHeroText">
            Quality OEM automotive parts professionally dismantled,
            inventoried, photographed, stored, and shipped from Texas.
          </p>

          <div className="publicActions">
            <button type="button" disabled>
              FIND A PART
              <small>COMING SOON</small>
            </button>

            <button type="button" disabled>
              REQUEST A PART
              <small>COMING SOON</small>
            </button>

            <button type="button" disabled>
              CONTACT US
              <small>COMING SOON</small>
            </button>
          </div>

          <div className="publicStatus">
            <span className="publicStatusDot" />
            <span>ONLINE STORE IN DEVELOPMENT</span>
          </div>
        </div>
      </section>

      <section className="publicPromise">
        <div>
          <strong>OEM</strong>
          <span>Original Equipment Parts</span>
        </div>

        <div>
          <strong>PROFESSIONAL</strong>
          <span>Handled From Donor to Shipment</span>
        </div>

        <div>
          <strong>TEXAS</strong>
          <span>Independent Automotive Recycler</span>
        </div>
      </section>

      <footer className="publicLandingFooter">
        <img
          src="/branding/texas-oem-parts-logo.svg"
          alt="Texas OEM Parts"
        />

        <p>
          © {new Date().getFullYear()} Texas OEM Parts. All rights reserved.
        </p>
      </footer>
    </main>
  )
}
