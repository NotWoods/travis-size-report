// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview
 * UI classes and methods for the info cards that display informations about
 * symbols as the user hovers or focuses on them.
 */

import {
  dom,
  getIconStyle,
  getIconTemplate,
  getSizeContents,
  setSizeClasses,
  state,
} from './state';

export const displayInfocard = (() => {
  const _CANVAS_RADIUS = 40;

  class Infocard {
    protected _infocard: HTMLElement;
    private _sizeInfo: HTMLHeadingElement;
    private _pathInfo: HTMLParagraphElement;
    protected _iconInfo: HTMLDivElement;
    private _typeInfo: HTMLSpanElement;

    /**
     * Last symbol type displayed.
     * Tracked to avoid re-cloning the same icon.
     */
    private _lastType = '';

    constructor(id: string) {
      this._infocard = document.getElementById(id)!;
      this._sizeInfo = this._infocard.querySelector<HTMLHeadingElement>('.size-info')!;
      this._pathInfo = this._infocard.querySelector<HTMLParagraphElement>('.path-info')!;
      this._iconInfo = this._infocard.querySelector<HTMLDivElement>('.icon-info')!;
      this._typeInfo = this._infocard.querySelector<HTMLSpanElement>('.type-info')!;
    }

    /**
     * Updates the size header, which normally displayed the byte size of the
     * node followed by an abbreviated version.
     *
     * Example: "1,234 bytes (1.23 KiB)"
     */
    _updateSize(node: TreeNode) {
      const { description, element, value } = getSizeContents(node);
      const sizeFragment = dom.createFragment([
        document.createTextNode(`${description} (`),
        element,
        document.createTextNode(')'),
      ]);

      // Update DOM
      setSizeClasses(this._sizeInfo, value);

      dom.replace(this._sizeInfo, sizeFragment);
    }

    /**
     * Updates the path text, which shows the idPath for directory nodes, and
     * srcPath / component for symbol nodes.
     * @param {TreeNode} node
     */
    _updatePaths(node: TreeNode) {
      let pathFragment;
      if (node.srcPath) {
        pathFragment = dom.createFragment([
          dom.textElement('span', 'Path: ', 'symbol-name-info'),
          document.createTextNode(node.srcPath),
        ]);
      } else {
        const path = node.idPath.slice(0, node.shortNameIndex);
        const boldShortName = dom.textElement('span', shortName(node), 'symbol-name-info');
        pathFragment = dom.createFragment([document.createTextNode(path), boldShortName]);
      }

      // Update DOM
      dom.replace(this._pathInfo, pathFragment);
    }

    /**
     * Updates the icon and type text. The type label is pulled from the
     * title of the icon supplied.
     * @param {SVGSVGElement} icon Icon to display
     */
    _setTypeContent(icon: SVGSVGElement) {
      const typeDescription = icon.querySelector('title')!.textContent;
      icon.setAttribute('fill', '#fff');

      this._typeInfo.textContent = typeDescription;
      this._iconInfo.removeChild(this._iconInfo.lastElementChild!);
      this._iconInfo.appendChild(icon);
    }

    /**
     * Toggle wheter or not the card is visible.
     * @param {boolean} isHidden
     */
    setHidden(isHidden: boolean) {
      if (isHidden) {
        this._infocard.setAttribute('hidden', '');
      } else {
        this._infocard.removeAttribute('hidden');
      }
    }

    /**
     * Updates the DOM for the info card.
     * @param {TreeNode} node
     */
    _updateInfocard(node: TreeNode) {
      const type = node.type[0];

      // Update DOM
      this._updateSize(node);
      this._updatePaths(node);
      if (type !== this._lastType) {
        // No need to create a new icon if it is identical.
        const icon = getIconTemplate(type);
        this._setTypeContent(icon);
        this._lastType = type;
      }
    }

    /**
     * Updates the card on the next animation frame.
     * @param {TreeNode} node
     */
    updateInfocard(node: TreeNode) {
      // @ts-ignore
      cancelAnimationFrame(Infocard._pendingFrame);
      // @ts-ignore
      Infocard._pendingFrame = requestAnimationFrame(() => this._updateInfocard(node));
    }
  }

  class SymbolInfocard extends Infocard {
    /**
     * @param {SVGSVGElement} icon Icon to display
     */
    _setTypeContent(icon: SVGSVGElement) {
      const color = icon.getAttribute('fill');
      super._setTypeContent(icon);
      this._iconInfo.style.backgroundColor = color;
    }
  }

  class ContainerInfocard extends Infocard {
    private _tableBody: HTMLTableSectionElement;
    private _ctx: CanvasRenderingContext2D;

    /**
     * Rows in the container
     * infocard that represent a particular symbol type.
     */
    private _infoRows: { [type: string]: HTMLTableRowElement };

    constructor(id: string) {
      super(id);
      this._tableBody = this._infocard.querySelector('tbody')!;
      this._ctx = this._infocard.querySelector('canvas')!.getContext('2d')!;

      this._infoRows = {
        b: this._tableBody.querySelector<HTMLTableRowElement>('.bss-info')!,
        d: this._tableBody.querySelector<HTMLTableRowElement>('.data-info')!,
        r: this._tableBody.querySelector<HTMLTableRowElement>('.rodata-info')!,
        t: this._tableBody.querySelector<HTMLTableRowElement>('.text-info')!,
        R: this._tableBody.querySelector<HTMLTableRowElement>('.relro-info')!,
        x: this._tableBody.querySelector<HTMLTableRowElement>('.dexnon-info')!,
        m: this._tableBody.querySelector<HTMLTableRowElement>('.dex-info')!,
        p: this._tableBody.querySelector<HTMLTableRowElement>('.pak-info')!,
        P: this._tableBody.querySelector<HTMLTableRowElement>('.paknon-info')!,
        o: this._tableBody.querySelector<HTMLTableRowElement>('.other-info')!,
      };

      /**
       * Update the DPI of the canvas for zoomed in and high density screens.
       */
      const _updateCanvasDpi = () => {
        this._ctx.canvas.height = _CANVAS_RADIUS * 2 * devicePixelRatio;
        this._ctx.canvas.width = _CANVAS_RADIUS * 2 * devicePixelRatio;
        this._ctx.scale(devicePixelRatio, devicePixelRatio);
      };

      _updateCanvasDpi();
      window.addEventListener('resize', _updateCanvasDpi);
    }

    /**
     * @param {SVGSVGElement} icon Icon to display
     */
    _setTypeContent(icon: SVGSVGElement) {
      super._setTypeContent(icon);
      icon.classList.add('canvas-overlay');
    }

    /**
     * Draw a border around part of a pie chart.
     * @param {number} angleStart Starting angle, in radians.
     * @param {number} angleEnd Ending angle, in radians.
     * @param {string} strokeColor Color of the pie slice border.
     * @param {number} lineWidth Width of the border.
     */
    _drawBorder(angleStart: number, angleEnd: number, strokeColor: string, lineWidth: number) {
      this._ctx.strokeStyle = strokeColor;
      this._ctx.lineWidth = lineWidth;
      this._ctx.beginPath();
      this._ctx.arc(40, 40, _CANVAS_RADIUS, angleStart, angleEnd);
      this._ctx.stroke();
    }

    /**
     * Draw a slice of a pie chart.
     * @param {number} angleStart Starting angle, in radians.
     * @param {number} angleEnd Ending angle, in radians.
     * @param {string} fillColor Color of the pie slice.
     */
    _drawSlice(angleStart: number, angleEnd: number, fillColor: string) {
      // Update DOM
      this._ctx.fillStyle = fillColor;
      // Move cursor to center, where line will start
      this._ctx.beginPath();
      this._ctx.moveTo(40, 40);
      // Move cursor to start of arc then draw arc
      this._ctx.arc(40, 40, _CANVAS_RADIUS, angleStart, angleEnd);
      // Move cursor back to center
      this._ctx.closePath();
      this._ctx.fill();
    }

    /**
     * Update a row in the breakdown table with the given values.
     * @param {HTMLTableRowElement} row
     * @param {{size:number,count:number} | null} stats Total size of the
     * symbols of a given type in a container.
     * @param {number} percentage How much the size represents in relation to
     * the total size of the symbols in the container.
     */
    private _updateBreakdownRow(
      row: HTMLTableRowElement,
      stats: { size: number; count: number } | null,
      percentage: number,
    ) {
      if (stats == null || stats.size === 0) {
        if (row.parentElement != null) {
          this._tableBody.removeChild(row);
        }
        return;
      }

      const countColumn = row.querySelector('.count')!;
      const sizeColumn = row.querySelector('.size')!;
      const percentColumn = row.querySelector('.percent')!;

      const countString = stats.count.toLocaleString(_LOCALE, {
        useGrouping: true,
      });
      const sizeString = stats.size.toLocaleString(_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      });
      const percentString = percentage.toLocaleString(_LOCALE, {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      // Update DOM
      countColumn.textContent = countString;
      sizeColumn.textContent = sizeString;
      percentColumn.textContent = percentString;
      this._tableBody.appendChild(row);
    }

    /**
     * Update DOM for the container infocard
     * @param {TreeNode} containerNode
     */
    _updateInfocard(containerNode: TreeNode) {
      const extraRows = Object.assign({}, this._infoRows);
      const statsEntries = Object.entries(containerNode.childStats).sort(
        (a, b) => b[1].size - a[1].size,
      );
      const diffMode = state.has('diff_mode');
      let totalSize = 0;
      for (const [, stats] of statsEntries) {
        totalSize += Math.abs(stats.size);
      }

      // Update DOM
      super._updateInfocard(containerNode);
      let angleStart = 0;
      for (const [type, stats] of statsEntries) {
        delete extraRows[type];
        const { color } = getIconStyle(type);
        const percentage = stats.size / totalSize;
        this._updateBreakdownRow(this._infoRows[type], stats, percentage);

        const arcLength = Math.abs(percentage) * 2 * Math.PI;
        if (arcLength > 0) {
          const angleEnd = angleStart + arcLength;

          this._drawSlice(angleStart, angleEnd, color);
          if (diffMode) {
            const strokeColor = stats.size > 0 ? '#ea4335' : '#34a853';
            this._drawBorder(angleStart, angleEnd, strokeColor, 16);
          }
          angleStart = angleEnd;
        }
      }

      // Hide unused types
      for (const row of Object.values(extraRows)) {
        this._updateBreakdownRow(row, null, 0);
      }
    }
  }

  const _containerInfo = new ContainerInfocard('infocard-container');
  const _symbolInfo = new SymbolInfocard('infocard-symbol');

  /**
   * Displays an infocard for the given symbol on the next frame.
   * @param {TreeNode} node
   */
  function displayInfocard(node: TreeNode) {
    if (_CONTAINER_TYPE_SET.has(node.type[0] as any)) {
      _containerInfo.updateInfocard(node);
      _containerInfo.setHidden(false);
      _symbolInfo.setHidden(true);
    } else {
      _symbolInfo.updateInfocard(node);
      _symbolInfo.setHidden(false);
      _containerInfo.setHidden(true);
    }
  }

  return displayInfocard;
})();