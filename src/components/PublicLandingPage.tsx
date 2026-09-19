import './PublicLandingPage.css'

export default function PublicLandingPage() {
  const year = new Date().getFullYear()

  return (
    <main className="publicLandingV2">
      {/* HEADER */}
      <header className="publicHeaderV2">
        <a className="publicBrandV2" href="/coming-soon" aria-label="Texas OEM Parts">
          <span className="publicBrandTextV2">
            <strong>TEXAS OEM</strong>
            <small>PARTS</small>
          </span>
        </a>

        <nav className="publicNavV2" aria-label="Main navigation">
          <a href="#about">ABOUT</a>
          <a href="#process">OUR PROCESS</a>
          <a href="#shipping">SHIPPING</a>
        </nav>

        <div className="publicHeaderStatusV2">
          <span />
          STORE COMING SOON
        </div>
      </header>

      {/* HERO */}
      <section className="publicHeroV2">
        <div className="publicHeroGridV2" />
        <div className="publicHeroRedGlowV2" />

        <div className="publicHeroInnerV2">
          <div className="publicHeroBadgeV2">
            <span />
            TEXAS OWNED &amp; OPERATED
          </div>

          <h1>
            OEM USED
            <br />
            AUTO PARTS.
            <strong> DONE RIGHT.</strong>
          </h1>

          <p className="publicHeroCopyV2">
            Quality OEM automotive parts professionally dismantled,
            inventoried, photographed, stored, and shipped from Texas.
          </p>

          <div className="publicHeroActionsV2">
            <button type="button" disabled>
              <span>FIND A PART</span>
              <small>ONLINE STORE COMING SOON</small>
            </button>

            <button type="button" disabled>
              <span>DIRECT ORDERING</span>
              <small>COMING SOON</small>
            </button>
          </div>

          <div className="publicDevelopmentV2">
            <i />
            <span>
              <strong>ONLINE STORE IN DEVELOPMENT</strong>
              Inventory is being prepared for direct online ordering.
            </span>
          </div>
        </div>

        <div className="publicHeroBottomV2">
          <span>SCROLL TO DISCOVER</span>
          <i />
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="publicTrustBarV2" aria-label="Texas OEM Parts standards">
        <div>
          <span className="publicTrustNumberV2">01</span>
          <p>
            <strong>GENUINE OEM</strong>
            Original Equipment Parts
          </p>
        </div>

        <div>
          <span className="publicTrustNumberV2">02</span>
          <p>
            <strong>PROFESSIONAL PROCESS</strong>
            Donor to Shipment
          </p>
        </div>

        <div>
          <span className="publicTrustNumberV2">03</span>
          <p>
            <strong>INVENTORY CONTROLLED</strong>
            Every Part Has a Place
          </p>
        </div>

        <div>
          <span className="publicTrustNumberV2">04</span>
          <p>
            <strong>SHIPPED FROM TEXAS</strong>
            Nationwide Fulfillment
          </p>
        </div>
      </section>

      {/* ABOUT */}
      <section className="publicAboutV2" id="about">
        <div className="publicSectionLabelV2">
          <span>01</span>
          TEXAS OEM PARTS
        </div>

        <div className="publicAboutGridV2">
          <div>
            <h2>
              NOT A JUNKYARD.
              <br />
              <strong>A PARTS OPERATION.</strong>
            </h2>
          </div>

          <div className="publicAboutCopyV2">
            <p>
              Texas OEM Parts is an independent automotive recycler built
              around one standard: handle used OEM parts like professional
              inventory.
            </p>

            <p>
              From the moment a donor vehicle enters our operation, usable
              components are systematically dismantled, identified,
              photographed, inventoried, stored, picked, packed, and shipped.
            </p>

            <div className="publicTexasStampV2">
              <span>BASED IN</span>
              <strong>TEXAS</strong>
              <small>SHIPPING NATIONWIDE</small>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="publicProcessV2" id="process">
        <div className="publicSectionLabelV2">
          <span>02</span>
          THE STANDARD
        </div>

        <div className="publicProcessHeadingV2">
          <h2>FROM DONOR TO YOUR DOOR.</h2>
          <p>
            A controlled process designed to keep parts identified,
            organized, and ready to ship.
          </p>
        </div>

        <div className="publicProcessCardsV2">
          <article>
            <span>01</span>
            <div className="publicProcessIconV2">+</div>
            <h3>DISMANTLE</h3>
            <p>
              Donor vehicles are systematically dismantled with usable OEM
              components selected for inventory.
            </p>
          </article>

          <article>
            <span>02</span>
            <div className="publicProcessIconV2">#</div>
            <h3>IDENTIFY</h3>
            <p>
              Parts are identified and documented so inventory stays
              traceable from donor vehicle to final sale.
            </p>
          </article>

          <article>
            <span>03</span>
            <div className="publicProcessIconV2">□</div>
            <h3>INVENTORY</h3>
            <p>
              Every listed component receives an inventory identity and a
              controlled warehouse location.
            </p>
          </article>

          <article>
            <span>04</span>
            <div className="publicProcessIconV2">→</div>
            <h3>SHIP</h3>
            <p>
              Sold parts are picked, packed, and prepared for shipment with
              the same controlled workflow.
            </p>
          </article>
        </div>
      </section>

      {/* SHIPPING */}
      <section className="publicShippingV2" id="shipping">
        <div className="publicShippingGlowV2" />

        <div className="publicShippingContentV2">
          <div className="publicSectionLabelV2">
            <span>03</span>
            BUILT TO SHIP
          </div>

          <h2>
            TEXAS BASED.
            <br />
            <strong>NATIONWIDE REACH.</strong>
          </h2>

          <p>
            From small components to large automotive assemblies, Texas OEM
            Parts is being built to support professional nationwide
            fulfillment.
          </p>

          <div className="publicShippingTypesV2">
            <span>GROUND</span>
            <i />
            <span>FREIGHT</span>
            <i />
            <span>LOCAL PICKUP</span>
          </div>
        </div>

        <div className="publicTexasGraphicV2">TX</div>
      </section>

      {/* STORE CTA */}
      <section className="publicStoreV2">
        <p className="publicEyebrowV2">TEXAS OEM PARTS ONLINE</p>

        <h2>THE STORE IS COMING.</h2>

        <p className="publicStoreCopyV2">
          We're building the inventory first. Direct parts search and online
          ordering are coming to TexasOEMParts.com.
        </p>

        <div className="publicStoreStatusV2">
          <span />
          ONLINE STORE IN DEVELOPMENT
        </div>
      </section>

      {/* FOOTER */}
      <footer className="publicFooterV2">
        <div className="publicFooterBottomV2">
          <p>© {year} TEXAS OEM PARTS. ALL RIGHTS RESERVED.</p>

          <p className="publicFooterVerseV2">
            PHILIPPIANS 4:13
          </p>

          <p>TEXAS • USA</p>
        </div>
      </footer>
    </main>
  )
}
