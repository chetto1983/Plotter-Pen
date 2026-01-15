export class Header {
    constructor() {
        this.element = this.create();
    }

    create() {
        const el = document.createElement('header');
        el.className = 'cad-header';
        el.innerHTML = `
        <div class="cad-header-left">
          <div class="cad-brand">
            <span class="cad-brand-name">Sacchi Plotter Pen</span>
            <span class="cad-brand-version">v3.2</span>
          </div>
        </div>
        <nav class="cad-nav" id="mainNav">
          <a href="#" class="cad-nav-link active">Editor</a>
        </nav>
        `;
        return el;
    }
}
