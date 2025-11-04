"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Part = {
  item: string;
  qty: number;
  note?: string;
  price: number;
  url?: string;
  excluded?: boolean;
  breakdown?: { view: string; items: string[] }[];
};

const DEFAULT_PARTS: Part[] = [
  {
    item: "2×4×8' studs",
    qty: 64,
    note: "walls, plates, headers",
    price: 3.45,
    url: "https://www.homedepot.com/p/100010804",
    breakdown: [
      { view: "Front", items: ["5 studs @ 16\" O.C.", "2 king studs", "2 jack studs", "2 top plates", "1 bottom plate", "1 top cap"] },
      { view: "Back", items: ["6 studs @ 16\" O.C.", "2 top plates", "1 bottom plate", "1 top cap"] },
      { view: "Left Side", items: ["12 studs @ 16\" O.C.", "4 top plates (2 per)", "2 bottom plates", "2 top caps"] },
      { view: "Right Side", items: ["12 studs @ 16\" O.C.", "4 top plates (2 per)", "2 bottom plates", "2 top caps"] },
      { view: "Header", items: ["2 pieces @ 4' for door header"] }
    ]
  },
  {
    item: "4×4×8' posts",
    qty: 8,
    note: "corner posts",
    price: 12.98,
    url: "https://www.homedepot.com/p/202096411",
    breakdown: [
      { view: "Front", items: ["2 corner posts"] },
      { view: "Back", items: ["2 corner posts"] },
      { view: "Left Side", items: ["2 corner posts"] },
      { view: "Right Side", items: ["2 corner posts"] }
    ]
  },
  {
    item: "2×6×8' joists",
    qty: 48,
    note: "floor & roof framing",
    price: 8.98,
    url: "https://www.homedepot.com/p/100021002",
    breakdown: [
      { view: "Floor", items: ["18 joists @ 16\" O.C. (9 joists × 2 pieces)", "6 rim joists (perimeter)"] },
      { view: "Roof", items: ["18 joists @ 16\" O.C. (9 joists × 2 pieces)", "6 rim joists (perimeter)"] }
    ]
  },
  { item: '7/16" OSB 4×8', qty: 16, note: "wall sheathing (12) + roof deck (4)", price: 16.48, url: "https://www.homedepot.com/p/100050301" },
  { item: '23/32" OSB T&G 4×8', qty: 4, note: "subfloor (8'×16' = 128 sq ft)", price: 24.98 },
  { item: 'Corrugated polycarbonate 26"×8\'', qty: 8, note: "flat roof (8' width × 16' length)", price: 27.98, excluded: true },
  { item: '3" exterior screws (5 lb)', qty: 1, note: "framing & sheathing", price: 29.97, excluded: true },
  { item: "Roofing screws w/ EPDM (50 ct)", qty: 2, note: "roof panels", price: 15.81 },
  { item: "Construction adhesive", qty: 1, note: "subfloor seams (optional)", price: 6.97 },
  { item: "Simpson angles/plates", qty: 8, note: "optional tie-downs", price: 1.98 },
];

const computeEstimate = (input: Part[]) => {
  const items = input.map((p) => ({ ...p, lineTotal: p.price * p.qty }));
  const subtotal = items.reduce((sum, { lineTotal, excluded }) => sum + (excluded ? 0 : lineTotal), 0);
  const contingency = subtotal * 0.1;
  return { items, subtotal, contingency, total: subtotal + contingency };
};

const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// ----- Drawing constants -----
const GRID_SIZE = 10; // 1" = 10px base (scaled later)
const SHED = { width: 8 * 12, height: 8 * 12, depth: 16 * 12 }; // inches
const THICKNESS_IN = 1.5; // all 2x lumber thickness (inches)
const TWO_BY_FOUR_DEPTH_IN = 3.5; // inches
const TWO_BY_SIX_DEPTH_IN = 5.5; // inches
const FOUR_BY_FOUR_IN = 3.5; // 4x4 actual dimension
const OC_SPACING_IN = 16; // inches on center

// Colors
const COLOR_2X4 = "#ef4444"; // red-500
const COLOR_2X6 = "#b91c1c"; // red-700 (darker)
const COLOR_4X4 = "#991b1b"; // red-800 (darkest)
const OUTLINE = "#7f1d1d"; // red-900 for outlines

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 0.5;
  const gridStep = GRID_SIZE * scale;
  for (let x = 0; x < width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
}

function useFramingDraw(view: string) {
  const draw = (
    ctx: CanvasRenderingContext2D,
    scale: number,
    width: number,
    height: number,
    rotation3D: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    showSiding: boolean = false,
    showRoofing: boolean = false,
    showFlooring: boolean = false,
    showRoofDeck: boolean = false
  ) => {
    const inch = (v: number) => v * GRID_SIZE * scale;
    const w = inch(SHED.width); // 8' width
    const h = inch(SHED.height); // 8' height
    const d = inch(SHED.depth); // 16' length/depth

    const studOC = inch(OC_SPACING_IN);
    const thick = inch(THICKNESS_IN);
    const depth2x4 = inch(TWO_BY_FOUR_DEPTH_IN);
    const depth2x6 = inch(TWO_BY_SIX_DEPTH_IN);
    const fourByFour = inch(FOUR_BY_FOUR_IN);

    // Center different view boxes
    const viewWidth = (view === "floor" || view === "roof" || view === "sideL" || view === "sideR") ? d : (view === "3d" ? d * 1.2 : w);
    const viewHeight = (view === "floor" || view === "roof") ? w : (view === "3d" ? h * 1.5 : h);
    const x0 = (width - viewWidth) / 2;
    const y0 = (height - viewHeight) / 2;

    // ---- FLOOR (plan): floor joists & perimeter (2x6) ----
    if (view === "floor") {
      // Joists: along depth (length d), thickness shown as 1.5"
      for (let x = 0; x <= d; x += studOC) {
        rect(ctx, x0 + x - thick / 2, y0, thick, w, COLOR_2X6);
      }
      // Ensure last joist present
      rect(ctx, x0 + d - thick / 2, y0, thick, w, COLOR_2X6);

      // Perimeter rim/band joists (2x6), thickness 1.5"
      // Left/right rims along depth
      rect(ctx, x0 - thick / 2, y0, thick, w, COLOR_2X6);
      rect(ctx, x0 + d - thick / 2, y0, thick, w, COLOR_2X6);
      // Front/back ledgers along width
      rect(ctx, x0 - thick / 2, y0 - thick / 2, d + thick, thick, COLOR_2X6);
      rect(ctx, x0 - thick / 2, y0 + w - thick / 2, d + thick, thick, COLOR_2X6);
    }

    // ---- ROOF (plan): roof joists & perimeter (same as floor) ----
    if (view === "roof") {
      // Joists: along depth (length d), thickness shown as 1.5"
      for (let x = 0; x <= d; x += studOC) {
        rect(ctx, x0 + x - thick / 2, y0, thick, w, COLOR_2X6);
      }
      // Ensure last joist present
      rect(ctx, x0 + d - thick / 2, y0, thick, w, COLOR_2X6);

      // Perimeter rim/band joists (2x6), thickness 1.5"
      // Left/right rims along depth
      rect(ctx, x0 - thick / 2, y0, thick, w, COLOR_2X6);
      rect(ctx, x0 + d - thick / 2, y0, thick, w, COLOR_2X6);
      // Front/back ledgers along width
      rect(ctx, x0 - thick / 2, y0 - thick / 2, d + thick, thick, COLOR_2X6);
      rect(ctx, x0 - thick / 2, y0 + w - thick / 2, d + thick, thick, COLOR_2X6);
    }

    // ---- FRONT/BACK (elevation): 2x4 wall with plates; show roof joist depth (5.5") band ----
    if (view === "front" || view === "back") {
      // Doorway dimensions (standard 36" wide x 80" tall door with rough opening)
      const doorWidth = inch(38); // 36" door + 2" for framing
      const doorHeight = inch(82); // 80" door + 2" for framing
      const doorX = w / 2 - doorWidth / 2; // centered on wall

      // Bottom plate (2x4) height = 1.5" - with gap for doorway
      if (view === "front") {
        rect(ctx, x0, y0 + h - thick, doorX, thick, COLOR_2X4); // left of door
        rect(ctx, x0 + doorX + doorWidth, y0 + h - thick, w - doorX - doorWidth, thick, COLOR_2X4); // right of door
      } else {
        rect(ctx, x0, y0 + h - thick, w, thick, COLOR_2X4); // full bottom plate on back
      }

      // Top plate (2x4)
      rect(ctx, x0, y0, w, thick, COLOR_2X4);

      // Studs (2x4): 1.5" wide by full wall height between plates
      const clearHeight = h - 2 * thick;
      // End corner posts (4x4): 3.5" wide
      rect(ctx, x0, y0 + thick, fourByFour, clearHeight, COLOR_4X4);
      rect(ctx, x0 + w - fourByFour, y0 + thick, fourByFour, clearHeight, COLOR_4X4);

      // Interior studs on-center starting at 16" from left edge
      for (let x = studOC; x < w; x += studOC) {
        // Skip studs in doorway area on front view
        if (view === "front" && x >= doorX && x <= doorX + doorWidth) {
          continue;
        }
        rect(ctx, x0 + x - thick / 2, y0 + thick, thick, clearHeight, COLOR_2X4);
      }

      // Add doorway framing on front view
      if (view === "front") {
        const headerHeight = inch(3.5 * 2 + 1.5); // Double 2x4 header (7" total with spacer)
        const doorTopY = y0 + h - thick - doorHeight;

        // King studs (full height on each side of door)
        rect(ctx, x0 + doorX - thick, y0 + thick, thick, clearHeight, COLOR_2X4);
        rect(ctx, x0 + doorX + doorWidth, y0 + thick, thick, clearHeight, COLOR_2X4);

        // Jack studs (trimmer studs supporting header)
        const jackHeight = doorHeight - headerHeight;
        rect(ctx, x0 + doorX, doorTopY + headerHeight, thick, jackHeight, COLOR_2X4);
        rect(ctx, x0 + doorX + doorWidth - thick, doorTopY + headerHeight, thick, jackHeight, COLOR_2X4);

        // Header (double 2x4 with spacer shown as solid)
        rect(ctx, x0 + doorX, doorTopY, doorWidth, headerHeight, COLOR_2X6);

        // Cripple stud above header (centered)
        const crippleHeight = doorTopY - (y0 + thick);
        if (crippleHeight > 0) {
          rect(ctx, x0 + doorX + doorWidth / 2 - thick / 2, y0 + thick, thick, crippleHeight, COLOR_2X4);
        }
      }

      // Top plate cap (2x4) shown as 1.5" sitting on top of top plate
      rect(ctx, x0, y0 - thick, w, thick, COLOR_2X4);
    }

    // ---- SIDES (elevation of 16' walls): 2x4 studs + plates; show roof band ----
    if (view === "sideL" || view === "sideR") {
      // Plates (2x4)
      rect(ctx, x0, y0 + h - thick, d, thick, COLOR_2X4); // bottom
      rect(ctx, x0, y0, d, thick, COLOR_2X4); // top

      // Studs along 16' length
      const clearHeight = h - 2 * thick;
      // End corner posts (4x4): 3.5" wide
      rect(ctx, x0, y0 + thick, fourByFour, clearHeight, COLOR_4X4);
      rect(ctx, x0 + d - fourByFour, y0 + thick, fourByFour, clearHeight, COLOR_4X4);
      // Interior studs on-center
      for (let x = studOC; x < d; x += studOC) {
        rect(ctx, x0 + x - thick / 2, y0 + thick, thick, clearHeight, COLOR_2X4);
      }

      // Top plate cap (2x4) shown as 1.5"
      rect(ctx, x0, y0 - thick, d, thick, COLOR_2X4);
    }

    // ---- 3D isometric view ----
    if (view === "3d") {
      // Apply rotation to 3D points
      const rotateX = (y: number, z: number, angle: number) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { y: y * cos - z * sin, z: y * sin + z * cos };
      };

      const rotateY = (x: number, z: number, angle: number) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: x * cos + z * sin, z: -x * sin + z * cos };
      };

      const rotateZ = (x: number, y: number, angle: number) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: x * cos - y * sin, y: x * sin + y * cos };
      };

      // Isometric projection with rotation
      const iso = (x: number, y: number, z: number) => {
        // Center the object first
        let xCentered = x - w / 2;
        let yCentered = y - h / 2;
        let zCentered = z - d / 2;

        // Apply Y-axis rotation (yaw - left-right)
        let rotY = rotateY(xCentered, zCentered, rotation3D.x);
        let xRot = rotY.x;
        let zRot = rotY.z;

        // Apply X-axis rotation (tilt - up-down)
        let rotX = rotateX(yCentered, zRot, rotation3D.y);
        let yRot = rotX.y;
        zRot = rotX.z;

        // Apply Z-axis rotation (roll)
        let rotZ = rotateZ(xRot, yRot, rotation3D.z);
        xRot = rotZ.x;
        yRot = rotZ.y;

        // Apply isometric projection and center on canvas
        return {
          x: width / 2 + xRot - zRot * 0.5,
          y: height / 2 + yRot - zRot * 0.3 - xRot * 0.3,
        };
      };

      // Helper to draw a 3D face from a 2D view
      const draw3DFace = (viewType: string, xOffset: number, yOffset: number, zOffset: number, rotX: number, rotY: number, rotZ: number) => {
        // This would render each view's 2D elements in 3D space
        // For now, we'll keep the manual 3D drawing but note this needs refactoring
      };

      // Draw floor frame first (bottom)
      ctx.fillStyle = COLOR_2X6;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1;

      // Floor joists (2x6) running along depth
      for (let x = 0; x <= w; x += studOC) {
        const p1 = iso(x, h, 0);
        const p2 = iso(x, h, d);
        const p3 = iso(x + thick, h, d);
        const p4 = iso(x + thick, h, 0);
        ctx.fillStyle = COLOR_2X6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Floor perimeter rim joists
      // Front rim
      const fr1 = iso(0, h, 0);
      const fr2 = iso(w, h, 0);
      const fr3 = iso(w, h - thick, 0);
      const fr4 = iso(0, h - thick, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(fr1.x, fr1.y);
      ctx.lineTo(fr2.x, fr2.y);
      ctx.lineTo(fr3.x, fr3.y);
      ctx.lineTo(fr4.x, fr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Back rim
      const br1 = iso(0, h, d);
      const br2 = iso(w, h, d);
      const br3 = iso(w, h - thick, d);
      const br4 = iso(0, h - thick, d);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(br1.x, br1.y);
      ctx.lineTo(br2.x, br2.y);
      ctx.lineTo(br3.x, br3.y);
      ctx.lineTo(br4.x, br4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Left rim
      const lr1 = iso(0, h, 0);
      const lr2 = iso(0, h, d);
      const lr3 = iso(0, h - thick, d);
      const lr4 = iso(0, h - thick, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(lr1.x, lr1.y);
      ctx.lineTo(lr2.x, lr2.y);
      ctx.lineTo(lr3.x, lr3.y);
      ctx.lineTo(lr4.x, lr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right rim
      const rr1 = iso(w, h, 0);
      const rr2 = iso(w, h, d);
      const rr3 = iso(w, h - thick, d);
      const rr4 = iso(w, h - thick, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(rr1.x, rr1.y);
      ctx.lineTo(rr2.x, rr2.y);
      ctx.lineTo(rr3.x, rr3.y);
      ctx.lineTo(rr4.x, rr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Front wall (8' width) with doorway
      const clearHeight = h - 2 * thick;
      const doorWidth = inch(38);
      const doorHeight = inch(82);
      const doorX = w / 2 - doorWidth / 2;
      const headerHeight = inch(3.5 * 2 + 1.5);
      const doorTopY = h - thick - doorHeight;

      // Bottom plate with gap for door
      const bp1 = iso(0, h, 0);
      const bp2 = iso(doorX, h, 0);
      const bp3 = iso(doorX, h - thick, 0);
      const bp4 = iso(0, h - thick, 0);
      ctx.fillStyle = COLOR_2X4;
      ctx.beginPath();
      ctx.moveTo(bp1.x, bp1.y);
      ctx.lineTo(bp2.x, bp2.y);
      ctx.lineTo(bp3.x, bp3.y);
      ctx.lineTo(bp4.x, bp4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const bp5 = iso(doorX + doorWidth, h, 0);
      const bp6 = iso(w, h, 0);
      const bp7 = iso(w, h - thick, 0);
      const bp8 = iso(doorX + doorWidth, h - thick, 0);
      ctx.beginPath();
      ctx.moveTo(bp5.x, bp5.y);
      ctx.lineTo(bp6.x, bp6.y);
      ctx.lineTo(bp7.x, bp7.y);
      ctx.lineTo(bp8.x, bp8.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 4x4 corner posts
      [0, w - fourByFour].forEach((xPos) => {
        const p1 = iso(xPos, h - thick, 0);
        const p2 = iso(xPos + fourByFour, h - thick, 0);
        const p3 = iso(xPos + fourByFour, thick, 0);
        const p4 = iso(xPos, thick, 0);
        ctx.fillStyle = COLOR_4X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Front wall 2x4 studs (skip doorway area)
      for (let x = studOC; x < w; x += studOC) {
        if (x >= doorX && x <= doorX + doorWidth) continue;
        const p1 = iso(x - thick / 2, h - thick, 0);
        const p2 = iso(x + thick / 2, h - thick, 0);
        const p3 = iso(x + thick / 2, thick, 0);
        const p4 = iso(x - thick / 2, thick, 0);
        ctx.fillStyle = COLOR_2X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Doorway framing
      // King studs
      const k1_1 = iso(doorX - thick, h - thick, 0);
      const k1_2 = iso(doorX, h - thick, 0);
      const k1_3 = iso(doorX, thick, 0);
      const k1_4 = iso(doorX - thick, thick, 0);
      ctx.fillStyle = COLOR_2X4;
      ctx.beginPath();
      ctx.moveTo(k1_1.x, k1_1.y);
      ctx.lineTo(k1_2.x, k1_2.y);
      ctx.lineTo(k1_3.x, k1_3.y);
      ctx.lineTo(k1_4.x, k1_4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const k2_1 = iso(doorX + doorWidth, h - thick, 0);
      const k2_2 = iso(doorX + doorWidth + thick, h - thick, 0);
      const k2_3 = iso(doorX + doorWidth + thick, thick, 0);
      const k2_4 = iso(doorX + doorWidth, thick, 0);
      ctx.beginPath();
      ctx.moveTo(k2_1.x, k2_1.y);
      ctx.lineTo(k2_2.x, k2_2.y);
      ctx.lineTo(k2_3.x, k2_3.y);
      ctx.lineTo(k2_4.x, k2_4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Jack studs
      const jackHeight = doorHeight - headerHeight;
      const j1_1 = iso(doorX, h - thick, 0);
      const j1_2 = iso(doorX + thick, h - thick, 0);
      const j1_3 = iso(doorX + thick, doorTopY + headerHeight, 0);
      const j1_4 = iso(doorX, doorTopY + headerHeight, 0);
      ctx.beginPath();
      ctx.moveTo(j1_1.x, j1_1.y);
      ctx.lineTo(j1_2.x, j1_2.y);
      ctx.lineTo(j1_3.x, j1_3.y);
      ctx.lineTo(j1_4.x, j1_4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const j2_1 = iso(doorX + doorWidth - thick, h - thick, 0);
      const j2_2 = iso(doorX + doorWidth, h - thick, 0);
      const j2_3 = iso(doorX + doorWidth, doorTopY + headerHeight, 0);
      const j2_4 = iso(doorX + doorWidth - thick, doorTopY + headerHeight, 0);
      ctx.beginPath();
      ctx.moveTo(j2_1.x, j2_1.y);
      ctx.lineTo(j2_2.x, j2_2.y);
      ctx.lineTo(j2_3.x, j2_3.y);
      ctx.lineTo(j2_4.x, j2_4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Header
      const h1 = iso(doorX, doorTopY + headerHeight, 0);
      const h2 = iso(doorX + doorWidth, doorTopY + headerHeight, 0);
      const h3 = iso(doorX + doorWidth, doorTopY, 0);
      const h4 = iso(doorX, doorTopY, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(h1.x, h1.y);
      ctx.lineTo(h2.x, h2.y);
      ctx.lineTo(h3.x, h3.y);
      ctx.lineTo(h4.x, h4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cripple stud
      const crippleHeight = doorTopY - thick;
      if (crippleHeight > 0) {
        const c1 = iso(doorX + doorWidth / 2 - thick / 2, thick, 0);
        const c2 = iso(doorX + doorWidth / 2 + thick / 2, thick, 0);
        const c3 = iso(doorX + doorWidth / 2 + thick / 2, doorTopY, 0);
        const c4 = iso(doorX + doorWidth / 2 - thick / 2, doorTopY, 0);
        ctx.fillStyle = COLOR_2X4;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.lineTo(c4.x, c4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Left side wall (16' depth)
      // 4x4 corner posts
      [0, d - fourByFour].forEach((zPos) => {
        const p1 = iso(0, h - thick, zPos);
        const p2 = iso(0, h - thick, zPos + fourByFour);
        const p3 = iso(0, thick, zPos + fourByFour);
        const p4 = iso(0, thick, zPos);
        ctx.fillStyle = COLOR_4X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Left side 2x4 studs
      for (let z = studOC; z < d; z += studOC) {
        const p1 = iso(0, h - thick, z - thick / 2);
        const p2 = iso(0, h - thick, z + thick / 2);
        const p3 = iso(0, thick, z + thick / 2);
        const p4 = iso(0, thick, z - thick / 2);
        ctx.fillStyle = COLOR_2X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Top plates on front and left walls
      ctx.fillStyle = COLOR_2X4;
      // Front top plate
      const tp1 = iso(0, thick, 0);
      const tp2 = iso(w, thick, 0);
      const tp3 = iso(w, 0, 0);
      const tp4 = iso(0, 0, 0);
      ctx.beginPath();
      ctx.moveTo(tp1.x, tp1.y);
      ctx.lineTo(tp2.x, tp2.y);
      ctx.lineTo(tp3.x, tp3.y);
      ctx.lineTo(tp4.x, tp4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Left top plate
      const ltp1 = iso(0, thick, 0);
      const ltp2 = iso(0, thick, d);
      const ltp3 = iso(0, 0, d);
      const ltp4 = iso(0, 0, 0);
      ctx.beginPath();
      ctx.moveTo(ltp1.x, ltp1.y);
      ctx.lineTo(ltp2.x, ltp2.y);
      ctx.lineTo(ltp3.x, ltp3.y);
      ctx.lineTo(ltp4.x, ltp4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Back wall (8' width at far end)
      // 4x4 corner posts
      [0, w - fourByFour].forEach((xPos) => {
        const p1 = iso(xPos, h - thick, d);
        const p2 = iso(xPos + fourByFour, h - thick, d);
        const p3 = iso(xPos + fourByFour, thick, d);
        const p4 = iso(xPos, thick, d);
        ctx.fillStyle = COLOR_4X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Back wall 2x4 studs
      for (let x = studOC; x < w; x += studOC) {
        const p1 = iso(x - thick / 2, h - thick, d);
        const p2 = iso(x + thick / 2, h - thick, d);
        const p3 = iso(x + thick / 2, thick, d);
        const p4 = iso(x - thick / 2, thick, d);
        ctx.fillStyle = COLOR_2X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Back top plate
      const btp1 = iso(0, thick, d);
      const btp2 = iso(w, thick, d);
      const btp3 = iso(w, 0, d);
      const btp4 = iso(0, 0, d);
      ctx.fillStyle = COLOR_2X4;
      ctx.beginPath();
      ctx.moveTo(btp1.x, btp1.y);
      ctx.lineTo(btp2.x, btp2.y);
      ctx.lineTo(btp3.x, btp3.y);
      ctx.lineTo(btp4.x, btp4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right side wall (16' depth)
      // 4x4 corner posts
      [0, d - fourByFour].forEach((zPos) => {
        const p1 = iso(w, h - thick, zPos);
        const p2 = iso(w, h - thick, zPos + fourByFour);
        const p3 = iso(w, thick, zPos + fourByFour);
        const p4 = iso(w, thick, zPos);
        ctx.fillStyle = COLOR_4X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Right side 2x4 studs
      for (let z = studOC; z < d; z += studOC) {
        const p1 = iso(w, h - thick, z - thick / 2);
        const p2 = iso(w, h - thick, z + thick / 2);
        const p3 = iso(w, thick, z + thick / 2);
        const p4 = iso(w, thick, z - thick / 2);
        ctx.fillStyle = COLOR_2X4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Right top plate
      const rtp1 = iso(w, thick, 0);
      const rtp2 = iso(w, thick, d);
      const rtp3 = iso(w, 0, d);
      const rtp4 = iso(w, 0, 0);
      ctx.fillStyle = COLOR_2X4;
      ctx.beginPath();
      ctx.moveTo(rtp1.x, rtp1.y);
      ctx.lineTo(rtp2.x, rtp2.y);
      ctx.lineTo(rtp3.x, rtp3.y);
      ctx.lineTo(rtp4.x, rtp4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Roof framing (roof joists - same as floor but at top)
      // Roof joists (2x6) running along depth at the top
      for (let x = 0; x <= w; x += studOC) {
        const p1 = iso(x, 0, 0);
        const p2 = iso(x, 0, d);
        const p3 = iso(x + thick, 0, d);
        const p4 = iso(x + thick, 0, 0);
        ctx.fillStyle = COLOR_2X6;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Roof perimeter rim joists
      // Front rim
      const rfr1 = iso(0, 0, 0);
      const rfr2 = iso(w, 0, 0);
      const rfr3 = iso(w, thick, 0);
      const rfr4 = iso(0, thick, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(rfr1.x, rfr1.y);
      ctx.lineTo(rfr2.x, rfr2.y);
      ctx.lineTo(rfr3.x, rfr3.y);
      ctx.lineTo(rfr4.x, rfr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Back rim
      const rbr1 = iso(0, 0, d);
      const rbr2 = iso(w, 0, d);
      const rbr3 = iso(w, thick, d);
      const rbr4 = iso(0, thick, d);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(rbr1.x, rbr1.y);
      ctx.lineTo(rbr2.x, rbr2.y);
      ctx.lineTo(rbr3.x, rbr3.y);
      ctx.lineTo(rbr4.x, rbr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Left rim
      const rlr1 = iso(0, 0, 0);
      const rlr2 = iso(0, 0, d);
      const rlr3 = iso(0, thick, d);
      const rlr4 = iso(0, thick, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(rlr1.x, rlr1.y);
      ctx.lineTo(rlr2.x, rlr2.y);
      ctx.lineTo(rlr3.x, rlr3.y);
      ctx.lineTo(rlr4.x, rlr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right rim
      const rrr1 = iso(w, 0, 0);
      const rrr2 = iso(w, 0, d);
      const rrr3 = iso(w, thick, d);
      const rrr4 = iso(w, thick, 0);
      ctx.fillStyle = COLOR_2X6;
      ctx.beginPath();
      ctx.moveTo(rrr1.x, rrr1.y);
      ctx.lineTo(rrr2.x, rrr2.y);
      ctx.lineTo(rrr3.x, rrr3.y);
      ctx.lineTo(rrr4.x, rrr4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Optional OSB flooring layer
      if (showFlooring) {
        ctx.fillStyle = "rgba(139, 115, 85, 0.8)"; // brown/wood color for floor
        ctx.strokeStyle = "#654321";
        ctx.lineWidth = 1;

        const floor1 = iso(0, h, 0);
        const floor2 = iso(w, h, 0);
        const floor3 = iso(w, h, d);
        const floor4 = iso(0, h, d);
        ctx.beginPath();
        ctx.moveTo(floor1.x, floor1.y);
        ctx.lineTo(floor2.x, floor2.y);
        ctx.lineTo(floor3.x, floor3.y);
        ctx.lineTo(floor4.x, floor4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Optional OSB roof deck layer
      if (showRoofDeck) {
        ctx.fillStyle = "rgba(160, 130, 95, 0.7)"; // lighter brown for roof deck
        ctx.strokeStyle = "#8b7355";
        ctx.lineWidth = 1;

        const deck1 = iso(0, 0, 0);
        const deck2 = iso(w, 0, 0);
        const deck3 = iso(w, 0, d);
        const deck4 = iso(0, 0, d);
        ctx.beginPath();
        ctx.moveTo(deck1.x, deck1.y);
        ctx.lineTo(deck2.x, deck2.y);
        ctx.lineTo(deck3.x, deck3.y);
        ctx.lineTo(deck4.x, deck4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Optional OSB siding layer
      if (showSiding) {
        ctx.fillStyle = "rgba(205, 170, 125, 0.7)"; // tan/wood color semi-transparent
        ctx.strokeStyle = "#8b7355";
        ctx.lineWidth = 1;

        // Front wall siding with doorway cutout
        const doorWidth = inch(38);
        const doorHeight = inch(82);
        const doorX = w / 2 - doorWidth / 2;
        const doorTopY = h - thick - doorHeight;

        // Left panel (floor to top, left edge to door left)
        const fsl1 = iso(0, h, 0);
        const fsl2 = iso(doorX, h, 0);
        const fsl3 = iso(doorX, 0, 0);
        const fsl4 = iso(0, 0, 0);
        ctx.beginPath();
        ctx.moveTo(fsl1.x, fsl1.y);
        ctx.lineTo(fsl2.x, fsl2.y);
        ctx.lineTo(fsl3.x, fsl3.y);
        ctx.lineTo(fsl4.x, fsl4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right panel (floor to top, door right to right edge)
        const fsr1 = iso(doorX + doorWidth, h, 0);
        const fsr2 = iso(w, h, 0);
        const fsr3 = iso(w, 0, 0);
        const fsr4 = iso(doorX + doorWidth, 0, 0);
        ctx.beginPath();
        ctx.moveTo(fsr1.x, fsr1.y);
        ctx.lineTo(fsr2.x, fsr2.y);
        ctx.lineTo(fsr3.x, fsr3.y);
        ctx.lineTo(fsr4.x, fsr4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Top panel above door (from door top to roof)
        const fst1 = iso(doorX, doorTopY, 0);
        const fst2 = iso(doorX + doorWidth, doorTopY, 0);
        const fst3 = iso(doorX + doorWidth, 0, 0);
        const fst4 = iso(doorX, 0, 0);
        ctx.beginPath();
        ctx.moveTo(fst1.x, fst1.y);
        ctx.lineTo(fst2.x, fst2.y);
        ctx.lineTo(fst3.x, fst3.y);
        ctx.lineTo(fst4.x, fst4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left wall siding
        const ls1 = iso(0, h, 0);
        const ls2 = iso(0, h, d);
        const ls3 = iso(0, 0, d);
        const ls4 = iso(0, 0, 0);
        ctx.beginPath();
        ctx.moveTo(ls1.x, ls1.y);
        ctx.lineTo(ls2.x, ls2.y);
        ctx.lineTo(ls3.x, ls3.y);
        ctx.lineTo(ls4.x, ls4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right wall siding
        const rs1 = iso(w, h, 0);
        const rs2 = iso(w, h, d);
        const rs3 = iso(w, 0, d);
        const rs4 = iso(w, 0, 0);
        ctx.beginPath();
        ctx.moveTo(rs1.x, rs1.y);
        ctx.lineTo(rs2.x, rs2.y);
        ctx.lineTo(rs3.x, rs3.y);
        ctx.lineTo(rs4.x, rs4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Back wall siding
        const bs1 = iso(0, h, d);
        const bs2 = iso(w, h, d);
        const bs3 = iso(w, 0, d);
        const bs4 = iso(0, 0, d);
        ctx.beginPath();
        ctx.moveTo(bs1.x, bs1.y);
        ctx.lineTo(bs2.x, bs2.y);
        ctx.lineTo(bs3.x, bs3.y);
        ctx.lineTo(bs4.x, bs4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Optional corrugated roofing layer
      if (showRoofing) {
        ctx.fillStyle = "rgba(147, 51, 234, 0.5)"; // purple semi-transparent
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 2;

        const roof1 = iso(0, 0, 0);
        const roof2 = iso(w, 0, 0);
        const roof3 = iso(w, 0, d);
        const roof4 = iso(0, 0, d);
        ctx.beginPath();
        ctx.moveTo(roof1.x, roof1.y);
        ctx.lineTo(roof2.x, roof2.y);
        ctx.lineTo(roof3.x, roof3.y);
        ctx.lineTo(roof4.x, roof4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw corrugation lines
        ctx.strokeStyle = "#9333ea";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        for (let x = 0; x <= w; x += inch(26)) {
          const c1 = iso(x, 0, 0);
          const c2 = iso(x, 0, d);
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  };

  return draw;
}

function useBlueprintCanvas(view: string, rotation3D: { x: number; y: number; z: number }, showSiding: boolean, showRoofing: boolean, showFlooring: boolean, showRoofDeck: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useFramingDraw(view);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Scale: Top/Left/Right fit the long 16' span; Front/Back fit 8' span
    let scale;
    if (view === "front" || view === "back") {
      scale = Math.min(width / (SHED.width * GRID_SIZE * 1.2), height / (SHED.height * GRID_SIZE * 1.3));
    } else if (view === "3d") {
      scale = Math.min(width / (SHED.depth * GRID_SIZE * 1.8), height / (SHED.height * GRID_SIZE * 2.2));
    } else {
      scale = Math.min(width / (SHED.depth * GRID_SIZE * 1.1), height / (SHED.height * GRID_SIZE * 1.3));
    }

    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height, scale * 0.5);
    draw(ctx, scale, width, height, rotation3D, showSiding, showRoofing, showFlooring, showRoofDeck);
  }, [view, rotation3D, showSiding, showRoofing, showFlooring, showRoofDeck, draw]);

  return canvasRef;
}

export default function BlueprintEstimator() {
  const [activeView, setActiveView] = useState("front");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [expandedPart, setExpandedPart] = useState<number | null>(null);
  const [rotation3D, setRotation3D] = useState({ x: 0, y: 0, z: 0 }); // Front facing, horizontal
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);
  const [showSiding, setShowSiding] = useState(false);
  const [showRoofing, setShowRoofing] = useState(false);
  const [showFlooring, setShowFlooring] = useState(false);
  const [showRoofDeck, setShowRoofDeck] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const { items, subtotal, contingency, total } = computeEstimate(DEFAULT_PARTS);
  const canvasRef = useBlueprintCanvas(activeView, rotation3D, showSiding, showRoofing, showFlooring, showRoofDeck);

  const reset3DView = () => {
    setRotation3D({ x: 0, y: 0, z: 0 });
  };

  const setPresetView = (preset: string) => {
    switch (preset) {
      case 'front':
        setRotation3D({ x: 0, y: 0, z: 0 });
        break;
      case 'back':
        setRotation3D({ x: Math.PI, y: 0, z: 0 });
        break;
      case 'left':
        setRotation3D({ x: -Math.PI / 2, y: 0, z: 0 });
        break;
      case 'right':
        setRotation3D({ x: Math.PI / 2, y: 0, z: 0 });
        break;
      case 'top':
        setRotation3D({ x: 0, y: -Math.PI / 2, z: 0 });
        break;
      case 'bottom':
        setRotation3D({ x: 0, y: Math.PI / 2, z: 0 });
        break;
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 text-[11px] font-normal">
      <div className="mx-auto max-w-7xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 rounded-2xl shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl mb-2">Parts & Pricing</CardTitle>
            <div className="bg-slate-100 px-3 py-2 rounded-md flex justify-between items-center text-sm font-medium">
              <span>Total Estimate</span>
              <span className="font-semibold text-base">{currency(total)}</span>
            </div>
          </CardHeader>

          <CardContent>
            <ScrollArea className="h-[520px] pr-2">
              <ul className="space-y-3">
                {items.map((p, i) => (
                  <li key={i} className="border rounded-md p-2 bg-slate-50">
                    <div
                      className="flex justify-between items-start cursor-pointer"
                      onClick={() => setExpandedPart(expandedPart === i ? null : i)}
                    >
                      <div className="w-full">
                        <div className="flex justify-between text-[12px] font-medium">
                          <span className={p.excluded ? "line-through text-slate-400" : ""}>{p.item}</span>
                          <span className={p.excluded ? "line-through text-slate-400" : ""}>{currency(p.lineTotal)}</span>
                        </div>
                        <div className="text-slate-600 text-[11px] flex justify-between">
                          <span className={p.excluded ? "line-through text-slate-400" : ""}>Qty: {p.qty}</span>
                          <span className={p.excluded ? "line-through text-slate-400" : ""}>Unit: {currency(p.price)}</span>
                        </div>
                        {p.note && <p className={`text-[10px] mt-1 ${p.excluded ? "line-through text-slate-400" : "text-slate-500"}`}>{p.note}</p>}
                        {p.excluded && <p className="text-[10px] text-green-600 mt-1 font-medium">Already owned</p>}
                        {p.breakdown && (
                          <p className="text-[10px] text-blue-600 mt-1 font-medium">
                            {expandedPart === i ? "▼ Hide details" : "▶ Show details"}
                          </p>
                        )}
                      </div>
                      {p.url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPart(p);
                          }}
                          className="ml-2 flex-shrink-0 hover:scale-105 transition-transform"
                        >
                          <img
                            src="https://upload.wikimedia.org/wikipedia/commons/5/5f/TheHomeDepot.svg"
                            alt="Home Depot"
                            className="w-5 h-5"
                          />
                        </button>
                      )}
                    </div>

                    {expandedPart === i && p.breakdown && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        {p.breakdown.map((section, idx) => (
                          <div key={idx} className="mb-3 last:mb-0">
                            <p className="text-[11px] font-semibold text-slate-700 mb-1">{section.view}:</p>
                            <ul className="ml-3 space-y-1">
                              {section.items.map((item, itemIdx) => (
                                <li key={itemIdx} className="text-[10px] text-slate-600">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <Separator className="my-3" />

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{currency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contingency (10%)</span>
                  <span>{currency(contingency)}</span>
                </div>
                <div className="flex justify-between font-semibold text-[12px]">
                  <span>Total</span>
                  <span>{currency(total)}</span>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7 rounded-2xl shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl mb-2">Blueprint Canvas</CardTitle>
            <p className="text-sm text-slate-600">2×4 shown at 1.5″×3.5″, 2×6 shown at 1.5″×5.5″. 16″ O.C. spacing.</p>
          </CardHeader>
          <CardContent>
            <Tabs value={activeView} onValueChange={setActiveView}>
              <TabsList className="flex justify-between mb-2">
                <TabsTrigger value="front">Front</TabsTrigger>
                <TabsTrigger value="back">Back</TabsTrigger>
                <TabsTrigger value="sideL">Left Side</TabsTrigger>
                <TabsTrigger value="sideR">Right Side</TabsTrigger>
                <TabsTrigger value="floor">Floor</TabsTrigger>
                <TabsTrigger value="roof">Roof</TabsTrigger>
                <TabsTrigger value="3d">3D View</TabsTrigger>
              </TabsList>

              <TabsContent value={activeView}>
                <div
                  className="relative w-full h-[520px] bg-slate-50 border border-slate-200 rounded-lg overflow-hidden"
                  onMouseDown={(e) => {
                    if (activeView !== "3d") return;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startRotation = { ...rotation3D };

                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      const deltaX = moveEvent.clientX - startX;
                      const deltaY = moveEvent.clientY - startY;
                      setRotation3D({
                        x: startRotation.x + deltaX * 0.01,
                        y: startRotation.y + deltaY * 0.01,
                        z: startRotation.z,
                      });
                    };

                    const handleMouseUp = () => {
                      document.removeEventListener("mousemove", handleMouseMove);
                      document.removeEventListener("mouseup", handleMouseUp);
                    };

                    document.addEventListener("mousemove", handleMouseMove);
                    document.addEventListener("mouseup", handleMouseUp);
                  }}
                  onMouseMove={(e) => {
                    if (activeView !== "3d" || !canvasRef.current) return;

                    const canvas = canvasRef.current;
                    const rect = canvas.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
                    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

                    // Simple face detection based on mouse position
                    const centerX = canvas.width / 2;
                    const centerY = canvas.height / 2;

                    if (y < centerY - 50) {
                      setHoveredFace("Roof");
                    } else if (x < centerX - 100) {
                      setHoveredFace("Left Side");
                    } else if (x > centerX + 100 && y > centerY) {
                      setHoveredFace("Floor");
                    } else if (y > centerY + 50) {
                      setHoveredFace("Front");
                    } else {
                      setHoveredFace(null);
                    }
                  }}
                  onMouseLeave={() => setHoveredFace(null)}
                >
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={520}
                    className={`w-full h-full ${activeView === "3d" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;

                      // Simple component detection based on canvas position
                      // This is a basic implementation - you may want to make this more sophisticated
                      if (activeView === "front" || activeView === "back") {
                        if (y > 200 && y < 500) {
                          setTooltip({ x: e.clientX, y: e.clientY, text: "2x4x8' Stud - $3.45 ea (1.5\" x 3.5\")" });
                        } else {
                          setTooltip(null);
                        }
                      } else {
                        setTooltip(null);
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  ></canvas>

                  {tooltip && (
                    <div
                      className="fixed bg-slate-900 text-white px-3 py-2 rounded-md text-xs font-medium shadow-lg pointer-events-none z-50"
                      style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}
                    >
                      {tooltip.text}
                    </div>
                  )}

                  {activeView === "3d" && hoveredFace && (
                    <div className="absolute top-4 left-4 bg-slate-900 text-white px-3 py-2 rounded-md text-sm font-medium shadow-lg">
                      {hoveredFace}
                    </div>
                  )}

                  {activeView === "3d" && (
                    <>
                      {!showControlPanel && (
                        <button
                          onClick={() => setShowControlPanel(true)}
                          className="absolute top-4 right-4 bg-white hover:bg-slate-100 rounded-md shadow-lg p-2 text-slate-700"
                          title="Show Controls"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                          </svg>
                        </button>
                      )}

                      {showControlPanel && (
                        <div className="absolute top-4 right-4 bg-white rounded-md shadow-lg p-3 space-y-3 max-w-xs">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-sm font-semibold text-slate-700">3D Controls</p>
                            <button
                              onClick={() => setShowControlPanel(false)}
                              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                              title="Hide Controls"
                            >
                              ×
                            </button>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-700 mb-2">Layers</p>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showFlooring}
                              onChange={(e) => setShowFlooring(e.target.checked)}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium">OSB Flooring</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showSiding}
                              onChange={(e) => setShowSiding(e.target.checked)}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium">OSB Siding</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showRoofDeck}
                              onChange={(e) => setShowRoofDeck(e.target.checked)}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium">OSB Roof Deck</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showRoofing}
                              onChange={(e) => setShowRoofing(e.target.checked)}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium">Corrugated Roofing</span>
                          </label>
                        </div>

                        <div className="border-t pt-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-700 mb-2">Preset Views</p>
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => setPresetView('front')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Front</button>
                            <button onClick={() => setPresetView('back')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Back</button>
                            <button onClick={() => setPresetView('left')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Left</button>
                            <button onClick={() => setPresetView('right')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Right</button>
                            <button onClick={() => setPresetView('top')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Top</button>
                            <button onClick={() => setPresetView('bottom')} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Bottom</button>
                          </div>
                        </div>

                        <div className="border-t pt-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-700 mb-2">Manual Rotation</p>

                          <div>
                            <label className="text-xs text-slate-600">Yaw (Left/Right): {rotation3D.x.toFixed(2)}</label>
                            <input
                              type="range"
                              min="-3.14"
                              max="3.14"
                              step="0.01"
                              value={rotation3D.x}
                              onChange={(e) => setRotation3D({ ...rotation3D, x: parseFloat(e.target.value) })}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-slate-600">Tilt (Up/Down): {rotation3D.y.toFixed(2)}</label>
                            <input
                              type="range"
                              min="-1.57"
                              max="1.57"
                              step="0.01"
                              value={rotation3D.y}
                              onChange={(e) => setRotation3D({ ...rotation3D, y: parseFloat(e.target.value) })}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-slate-600">Roll (Rotate): {rotation3D.z.toFixed(2)}</label>
                            <input
                              type="range"
                              min="-3.14"
                              max="3.14"
                              step="0.01"
                              value={rotation3D.z}
                              onChange={(e) => setRotation3D({ ...rotation3D, z: parseFloat(e.target.value) })}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                        </div>
                      )}

                      <button
                        onClick={reset3DView}
                        className="absolute bottom-4 right-4 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-lg transition-colors"
                      >
                        Reset View
                      </button>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Modal with Embedded Home Depot Page */}
      {selectedPart && (
        <Dialog open={!!selectedPart} onOpenChange={() => setSelectedPart(null)}>
          <DialogContent className="rounded-2xl p-4 max-w-[80vw] max-h-[80vh] bg-white border border-slate-300 shadow-lg overflow-hidden backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold mb-2">{selectedPart.item}</DialogTitle>
              <DialogDescription className="text-sm text-slate-600 mb-4">
                Quantity: {selectedPart.qty} — Unit Price: {currency(selectedPart.price)}
              </DialogDescription>
            </DialogHeader>

            <iframe
              src={selectedPart.url}
              title={selectedPart.item}
              className="w-full h-[65vh] rounded-lg border-none overflow-hidden"
              style={{ scrollbarWidth: 'none' }}
            ></iframe>

            <div className="flex justify-end mt-3 space-x-2">
              <a
                href={selectedPart.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 h-10 px-4 py-2 transition-colors"
              >
                Open in New Tab
              </a>
            </div>

            <DialogClose
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
              onClick={() => setSelectedPart(null)}
            >
              ✕
            </DialogClose>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
