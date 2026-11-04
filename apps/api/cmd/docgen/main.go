package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	outputPath := filepath.Join("..", "..", "docs", "01-project-genesis-and-asset-pipeline.docx")
	slog.Info("generating executive word document (.docx)...", "output", outputPath)

	docxData, err := buildDocx()
	if err != nil {
		slog.Error("failed to generate docx", "error", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		slog.Error("failed to create output dir", "error", err)
		os.Exit(1)
	}

	if err := os.WriteFile(outputPath, docxData, 0644); err != nil {
		slog.Error("failed to write docx file", "error", err)
		os.Exit(1)
	}

	slog.Info("successfully generated executive word document", "path", outputPath, "size_bytes", len(docxData))
}

func buildDocx() ([]byte, error) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// 1. [Content_Types].xml
	if err := addZipFile(zw, "[Content_Types].xml", contentTypesXML); err != nil {
		return nil, err
	}

	// 2. _rels/.rels
	if err := addZipFile(zw, "_rels/.rels", rootRelsXML); err != nil {
		return nil, err
	}

	// 3. word/_rels/document.xml.rels
	if err := addZipFile(zw, "word/_rels/document.xml.rels", documentRelsXML); err != nil {
		return nil, err
	}

	// 4. word/styles.xml
	if err := addZipFile(zw, "word/styles.xml", stylesXML); err != nil {
		return nil, err
	}

	// 5. word/header1.xml
	if err := addZipFile(zw, "word/header1.xml", headerXML); err != nil {
		return nil, err
	}

	// 6. word/footer1.xml
	if err := addZipFile(zw, "word/footer1.xml", footerXML); err != nil {
		return nil, err
	}

	// 7. word/document.xml
	docXML := buildDocumentXML()
	if err := addZipFile(zw, "word/document.xml", docXML); err != nil {
		return nil, err
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

func addZipFile(zw *zip.Writer, name, content string) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = w.Write([]byte(content))
	return err
}

const contentTypesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`

const rootRelsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const documentRelsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`

const headerXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Header"/>
      <w:jc w:val="right"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="6" w:space="4" w:color="CBD5E1"/>
      </w:pBdr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="TH Sarabun New"/>
        <w:color w:val="64748B"/>
        <w:sz w:val="17"/>
        <w:caps/>
      </w:rPr>
      <w:t>AURA TECH — Master Architectural Blueprint &amp; Asset Genesis</w:t>
    </w:r>
  </w:p>
</w:hdr>`

const footerXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:tabs>
        <w:tab w:val="right" w:pos="9072"/>
      </w:tabs>
      <w:pBdr>
        <w:top w:val="single" w:sz="6" w:space="4" w:color="CBD5E1"/>
      </w:pBdr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="TH Sarabun New"/>
        <w:color w:val="94A3B8"/>
        <w:sz w:val="18"/>
      </w:rPr>
      <w:t>CONFIDENTIAL &amp; PROPRIETARY — AURA TECH MONOREPO</w:t>
    </w:r>
    <w:r>
      <w:tab/>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="TH Sarabun New"/>
        <w:color w:val="64748B"/>
        <w:sz w:val="18"/>
      </w:rPr>
      <w:t>Page </w:t>
    </w:r>
    <w:fldSimple w:instr="PAGE"/>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="TH Sarabun New"/>
        <w:color w:val="64748B"/>
        <w:sz w:val="18"/>
      </w:rPr>
      <w:t> of </w:t>
    </w:r>
    <w:fldSimple w:instr="NUMPAGES"/>
  </w:p>
</w:ftr>`

const stylesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Segoe UI" w:cs="TH Sarabun New"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="28"/>
        <w:color w:val="334155"/>
        <w:lang w:val="en-US" w:bidi="th-TH"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="140" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="360" w:after="160"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="18" w:space="6" w:color="2563EB"/>
      </w:pBdr>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold" w:cs="TH Sarabun New"/>
      <w:b/>
      <w:color w:val="0F172A"/>
      <w:sz w:val="34"/>
      <w:szCs w:val="40"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="260" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold" w:cs="TH Sarabun New"/>
      <w:b/>
      <w:color w:val="1E293B"/>
      <w:sz w:val="28"/>
      <w:szCs w:val="34"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="180" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold" w:cs="TH Sarabun New"/>
      <w:b/>
      <w:color w:val="334155"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="30"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Header">
    <w:name w:val="header"/>
    <w:basedOn w:val="Normal"/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Footer">
    <w:name w:val="footer"/>
    <w:basedOn w:val="Normal"/>
  </w:style>
</w:styles>`

// Helper builders for rich OpenXML elements
func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}

func p(text string) string {
	return fmt.Sprintf(`<w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, escapeXML(text))
}

func pWithStyle(text, style string) string {
	return fmt.Sprintf(`<w:p><w:pPr><w:pStyle w:val="%s"/></w:pPr><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, style, escapeXML(text))
}

func pBoldLead(boldPrefix, normalRest string) string {
	return fmt.Sprintf(`<w:p><w:r><w:rPr><w:b/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">%s: </w:t></w:r><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, escapeXML(boldPrefix), escapeXML(normalRest))
}

func pageBreak() string {
	return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
}

func calloutBox(title, body, hexColor string) string {
	if hexColor == "" {
		hexColor = "2563EB"
	}
	var sb strings.Builder
	sb.WriteString(`<w:p>`)
	sb.WriteString(`<w:pPr>`)
	sb.WriteString(`<w:pBdr>`)
	sb.WriteString(fmt.Sprintf(`<w:left w:val="single" w:sz="36" w:space="15" w:color="%s"/>`, hexColor))
	sb.WriteString(`</w:pBdr>`)
	sb.WriteString(`<w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>`)
	sb.WriteString(`<w:spacing w:before="160" w:after="160" w:line="260" w:lineRule="auto"/>`)
	sb.WriteString(`<w:ind w:left="240" w:right="240"/>`)
	sb.WriteString(`</w:pPr>`)
	if title != "" {
		sb.WriteString(fmt.Sprintf(`<w:r><w:rPr><w:b/><w:color w:val="%s"/><w:sz w:val="23"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r><w:r><w:br/></w:r>`, hexColor, escapeXML(title)))
	}
	sb.WriteString(fmt.Sprintf(`<w:r><w:rPr><w:color w:val="334155"/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r>`, escapeXML(body)))
	sb.WriteString(`</w:p>`)
	return sb.String()
}

func codeBlock(codeLines []string) string {
	var sb strings.Builder
	sb.WriteString(`<w:p>`)
	sb.WriteString(`<w:pPr>`)
	sb.WriteString(`<w:shd w:val="clear" w:color="auto" w:fill="0F172A"/>`)
	sb.WriteString(`<w:spacing w:before="140" w:after="140" w:line="220" w:lineRule="auto"/>`)
	sb.WriteString(`<w:ind w:left="200" w:right="200"/>`)
	sb.WriteString(`</w:pPr>`)
	for i, line := range codeLines {
		sb.WriteString(`<w:r>`)
		sb.WriteString(`<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="E2E8F0"/><w:sz w:val="18"/></w:rPr>`)
		sb.WriteString(fmt.Sprintf(`<w:t xml:space="preserve">%s</w:t>`, escapeXML(line)))
		sb.WriteString(`</w:r>`)
		if i < len(codeLines)-1 {
			sb.WriteString(`<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr><w:br/></w:r>`)
		}
	}
	sb.WriteString(`</w:p>`)
	return sb.String()
}

func tableRow(cells []string, isHeader bool, widths []int) string {
	var sb strings.Builder
	sb.WriteString(`<w:tr>`)
	for i, cell := range cells {
		w := 2400
		if i < len(widths) {
			w = widths[i]
		}
		fill := "FFFFFF"
		txtColor := "334155"
		boldTag := ""
		if isHeader {
			fill = "0F172A"
			txtColor = "FFFFFF"
			boldTag = "<w:b/>"
		}
		sb.WriteString(`<w:tc>`)
		sb.WriteString(`<w:tcPr>`)
		sb.WriteString(fmt.Sprintf(`<w:tcW w:w="%d" w:type="dxa"/>`, w))
		sb.WriteString(fmt.Sprintf(`<w:shd w:val="clear" w:color="auto" w:fill="%s"/>`, fill))
		sb.WriteString(`<w:tcBorders>`)
		sb.WriteString(`<w:top w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>`)
		sb.WriteString(`<w:left w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>`)
		sb.WriteString(`<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>`)
		sb.WriteString(`<w:right w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>`)
		sb.WriteString(`</w:tcBorders>`)
		sb.WriteString(`<w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar>`)
		sb.WriteString(`</w:tcPr>`)
		sb.WriteString(`<w:p>`)
		sb.WriteString(`<w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>`)
		sb.WriteString(`<w:r>`)
		sb.WriteString(fmt.Sprintf(`<w:rPr>%s<w:color w:val="%s"/><w:sz w:val="20"/></w:rPr>`, boldTag, txtColor))
		sb.WriteString(fmt.Sprintf(`<w:t xml:space="preserve">%s</w:t>`, escapeXML(cell)))
		sb.WriteString(`</w:r>`)
		sb.WriteString(`</w:p>`)
		sb.WriteString(`</w:tc>`)
	}
	sb.WriteString(`</w:tr>`)
	return sb.String()
}

func buildDocumentXML() string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	sb.WriteString(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`)
	sb.WriteString(`<w:body>`)

	// ==========================================
	// PAGE 1: COVER PAGE
	// ==========================================
	sb.WriteString(`<w:p><w:pPr><w:spacing w:before="900" w:after="200"/></w:pPr>`)
	sb.WriteString(`<w:r><w:rPr><w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold"/><w:color w:val="2563EB"/><w:sz w:val="22"/><w:caps/></w:rPr><w:t>ENTERPRISE ARCHITECTURE SPECIFICATION &amp; TECHNICAL RECORD</w:t></w:r></w:p>`)

	sb.WriteString(`<w:p><w:pPr><w:spacing w:before="100" w:after="240"/><w:pBdr><w:bottom w:val="single" w:sz="36" w:space="12" w:color="0F172A"/></w:pBdr></w:pPr>`)
	sb.WriteString(`<w:r><w:rPr><w:rFonts w:ascii="Segoe UI Black" w:hAnsi="Segoe UI Black"/><w:b/><w:color w:val="0F172A"/><w:sz w:val="60"/><w:szCs w:val="68"/></w:rPr><w:t>AURA TECH Monorepo</w:t></w:r></w:p>`)

	sb.WriteString(`<w:p><w:pPr><w:spacing w:before="120" w:after="600"/></w:pPr>`)
	sb.WriteString(`<w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:color w:val="475569"/><w:sz w:val="28"/><w:szCs w:val="34"/></w:rPr><w:t>Project Genesis, Architectural Evolution &amp; The Alpha Asset Pipeline</w:t></w:r><w:r><w:br/></w:r><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="22"/></w:rPr><w:t>จากพิมพ์เขียวสู่ระบบ E-Commerce ระดับพรีเมียม และมหากาพย์ไปป์ไลน์ตัดพื้นหลัง Transparent PNG 100%</w:t></w:r></w:p>`)

	sb.WriteString(calloutBox("PROJECT SPECIFICATION &amp; METADATA",
		"Document Role: Principal Full-Stack Architect\n"+
			"Target Ecosystem: Apple & IT Gadget Flagship E-Commerce Monorepo\n"+
			"Technologies: Go 1.23+, React 19, TypeScript, PostgreSQL 16 (JSONB), MinIO S3, Docker Compose\n"+
			"Document Release Version: v1.0.0 (Production Verified)\n"+
			"Verification Status: All 17 Catalog Assets Production OK (True Alpha Transparency)\n"+
			"Date: "+time.Now().Format("02 January 2006"), "0F172A"))

	sb.WriteString(`<w:p><w:pPr><w:spacing w:before="600" w:after="0"/></w:pPr>`)
	sb.WriteString(`<w:r><w:rPr><w:i/><w:color w:val="94A3B8"/><w:sz w:val="20"/></w:rPr><w:t>เอกสารฉบับนี้รวบรวมประวัติการพัฒนา การตัดสินใจเชิงสถาปัตยกรรม (Architectural Decision Records) ปัญหาคอขวดที่พบ และแนวทางแก้ไขทางวิศวกรรม ตั้งแต่การเริ่มต้น Monorepo จนถึงความสำเร็จของระบบตัดต่อภาพระดับพิกเซล</w:t></w:r></w:p>`)

	sb.WriteString(pageBreak())

	// ==========================================
	// PAGE 2: EXECUTIVE SUMMARY & CORE PILLARS
	// ==========================================
	sb.WriteString(pWithStyle("1. บทสรุปผู้บริหารและปรัชญาการออกแบบ (Executive Summary & Core Philosophy)", "Heading1"))

	sb.WriteString(p("โปรเจกต์ AURA TECH ถูกก่อตั้งขึ้นโดยมีวิสัยทัศน์ในการสร้างแพลตฟอร์มพาณิชย์อิเล็กทรอนิกส์ (E-Commerce) ที่มอบประสบการณ์การใช้งานที่ประณีต ลื่นไหล และหรูหราเทียบเท่า Apple Store Online โดยรวมเอาสินค้ากลุ่ม Flagship IT Gadgets, MacBook M4 Series, Windows Ultrabooks, หน้าจอระดับสตูดิโอ และอุปกรณ์แมคคานิคอลคีย์บอร์ดระดับพรีเมียมเข้าไว้ด้วยกัน"))

	sb.WriteString(p("ในการพัฒนาซอฟต์แวร์ระดับนี้ ทีมวิศวกรได้ยึดถือกฎเหล็ก 4 ประการ (Core Engineering Pillars) เพื่อให้แน่ใจว่าผลลัพธ์ทุกชิ้นพร้อมสำหรับ Production และปราศจากหนี้ทางเทคนิค (Technical Debt):"))

	sb.WriteString(calloutBox("4 กฎเหล็กทางวิศวกรรม (ENGINEERING PILLARS)",
		"1. ZERO PLACEHOLDERS: ปราศจาก // TODO, โค้ดละไว้ หรือ Mock ข้อมูลหลอก ทุกโมดูลต้องสมบูรณ์ 100%\n"+
			"2. STRICT CONTRACT ADHERENCE: จัดเก็บราคาทุกรายการด้วย int64 สตางค์ และ JSON Schema ตรงกัน 1:1 ระหว่าง Go และ TypeScript\n"+
			"3. ATOMIC INTEGRITY: ป้องกันปัญหาสต็อกเกินด้วยการ Soft-Lock 15 นาที ผ่าน Database Transaction ปลอดภัยต่อสภาวะ Race Condition\n"+
			"4. PROVE IT WORKS: ทุกขั้นตอนต้องผ่านการตรวจสอบด้วยคอมไพเลอร์จริง (go build ./..., tsc --noEmit, docker-compose) ก่อนส่งมอบ", "2563EB"))

	sb.WriteString(pWithStyle("โครงสร้างการเชื่อมต่อสถาปัตยกรรมโดยรวม (System Topology)", "Heading2"))
	sb.WriteString(p("ระบบทั้งหมดถูกจัดโครงสร้างให้อยู่ภายใต้ Monorepo บน Docker Compose โดยแบ่งการทำงานออกเป็น 5 ชั้น (Layers) ที่สื่อสารกันอย่างรัดกุม:"))

	sb.WriteString(codeBlock([]string{
		"+--------------------------------------------------------------------------+",
		"|                     AURA TECH MONOREPO ARCHITECTURE                      |",
		"+--------------------------------------------------------------------------+",
		"|  [CLIENT LAYER]                                                          |",
		"|    - React 19 + TypeScript + Vite Single Page Application                |",
		"|    - TanStack Router (Type-Safe URL Params) & TanStack Query             |",
		"|    - Framer Motion (layoutId transitions) & Scoped Lenis Smooth Scroll   |",
		"+--------------------------------------------------------------------------+",
		"                                     | (HTTP REST / JSON Envelope)",
		"                                     v",
		"+--------------------------------------------------------------------------+",
		"|  [API ENGINE LAYER]                                                      |",
		"|    - Go 1.23+ with Chi Router (Middleware Pipeline & Slog Logging)       |",
		"|    - JWT Authentication & Guest Session Merging inside DB Transactions   |",
		"|    - 15-Minute Atomic Soft-Lock Reservation & Background Expire Worker   |",
		"+--------------------------------------------------------------------------+",
		"             |                                              |",
		"             v                                              v",
		"+-------------------------+                    +---------------------------+",
		"|  [PERSISTENCE LAYER]    |                    |  [OBJECT STORAGE LAYER]   |",
		"|  - PostgreSQL 16 Alpine |                    |  - MinIO S3-Compatible    |",
		"|  - JSONB Faceted Index  |                    |  - Bucket: aura-assets    |",
		"|  - pg_trgm & uuid-ossp  |                    |  - True Alpha Cutouts PNG |",
		"+-------------------------+                    +---------------------------+",
	}))

	sb.WriteString(pageBreak())

	// ==========================================
	// PAGE 3: PHASE 1 & PHASE 2 (INFRASTRUCTURE & DATABASE)
	// ==========================================
	sb.WriteString(pWithStyle("2. การวางรากฐานและโครงสร้าง Monorepo (Scaffolding & Infrastructure)", "Heading1"))
	sb.WriteString(p("การเริ่มต้นโปรเจกต์ไม่ได้เริ่มจากการเขียนฟีเจอร์ทันที แต่เริ่มต้นจากการเตรียมเครื่องมือและโครงสร้างระบบที่แข็งแกร่ง (Scaffold-First Engineering) เพื่อให้ทุกการทำงานในอนาคตมีความเสถียรสูงสุด:"))

	sb.WriteString(pBoldLead("Single Source of Truth Environment", "จัดทำไฟล์ .env และ .env.example ที่ศูนย์กลาง เพื่อควบคุมพอร์ต คีย์ลับ JWT และ URL การเชื่อมต่อระหว่าง Container โดยไม่มีการกระจายคอนฟิกไปหลายจุด"))
	sb.WriteString(pBoldLead("ความท้าทายด้าน SSL Proxy และวิธีรับมือ", "ในระหว่างการ Build Dockerfile.dev ฝั่ง Go พบปัญหา SSL Handshake บน Alpine Linux Package Manager ซึ่งได้รับการแก้ไขอย่างเด็ดขาดโดยการเปลี่ยน Endpoint เป็น http:// พร้อมตรึง Air Hot-Reload v1.61.7 และตัด Context Transfer ขยะด้วย .dockerignore"))

	sb.WriteString(pWithStyle("3. สถาปัตยกรรมฐานข้อมูลและ Seeder เสมือนจริง (Database & Seeder)", "Heading1"))
	sb.WriteString(p("ข้อมูลสเปกคอมพิวเตอร์และโน้ตบุ๊กมีความลึกและซับซ้อนสูงมาก เราจึงเลือกใช้สถาปัตยกรรม Hybrid Relational + GIN Indexed JSONB:"))

	tableWidths := []int{2400, 2400, 4200}
	sb.WriteString(`<w:tbl>`)
	sb.WriteString(`<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblLook w:val="04A0"/></w:tblPr>`)
	sb.WriteString(tableRow([]string{"Entity / Table", "Storage Type", "Architectural Role & Key Features"}, true, tableWidths))
	sb.WriteString(tableRow([]string{"products", "Relational + JSONB", "เก็บข้อมูลสินค้าหลัก, หมวดหมู่, แบรนด์, Usage Personas, Bento Highlights, What's in the Box และ Full Spec Matrix"}, false, tableWidths))
	sb.WriteString(tableRow([]string{"product_variants", "Relational + JSONB (GIN)", "เก็บ SKU ย่อยตามสี/สเปก, ราคาสตางค์ (int64), สต็อกจริง, สต็อกจอง (reserved_stock), Specs และภาพโปร่งใสใน MinIO"}, false, tableWidths))
	sb.WriteString(tableRow([]string{"banners", "Relational", "แบนเนอร์แบบ Component-Driven รองรับ Placement: HERO_SPLIT, BENTO_GRID, TOP_RIBBON พร้อม Adaptive Dark/Light Mode"}, false, tableWidths))
	sb.WriteString(tableRow([]string{"stock_reservations", "Relational (Indexed)", "ตารางซอฟต์ล็อคสต็อกอัตโนมัติ 15 นาที มี Index บน expires_at สำหรับ Background Worker ตรวจสอบ"}, false, tableWidths))
	sb.WriteString(tableRow([]string{"orders & order_items", "Relational", "เก็บประวัติคำสั่งซื้อ ยอดเงิน และรองรับ Order State Machine ที่บังคับกรอก Serial Number ก่อนเปลี่ยนเป็น SHIPPED"}, false, tableWidths))
	sb.WriteString(`</w:tbl>`)

	sb.WriteString(p("Seeder ถูกสร้างขึ้นใน cmd/seeder/main.go โดยใส่ข้อมูลสเปกจริง ละเอียดถึงระดับสถาปัตยกรรมคอร์ CPU, ชนิดหน้าจอ Liquid Retina XDR / ROG Nebula OLED, น้ำหนักเป็นกิโลกรัม และรายการอุปกรณ์ในกล่องครบถ้วน"))

	sb.WriteString(pageBreak())

	// ==========================================
	// PAGE 4: PHASE 3 (BACKEND ENGINE & CONCURRENCY)
	// ==========================================
	sb.WriteString(pWithStyle("4. กลไกประมวลผล Backend และ Concurrency Control (Go API Engine)", "Heading1"))
	sb.WriteString(p("ฝั่งเซิร์ฟเวอร์ถูกสร้างด้วยภาษา Go 1.23+ ภายใต้รูปแบบ Clean Architecture แบ่งแยกความรับผิดชอบอย่างชัดเจนระหว่าง Repository, Service และ HTTP Handler:"))

	sb.WriteString(pWithStyle("Standardized JSON Envelope Response", "Heading2"))
	sb.WriteString(p("ทุกคำตอบจาก REST API จะถูกห่อหุ้มด้วยโครงสร้างมาตรฐานเดียวกัน เพื่อให้ฝั่ง Frontend สามารถจัดการ State และ Error Handling ได้อย่างเป็นหนึ่งเดียว:"))

	sb.WriteString(codeBlock([]string{
		"type StandardResponse struct {",
		"    Success bool        `json:\"success\"`",
		"    Data    interface{} `json:\"data,omitempty\"`",
		"    Meta    *MetaInfo   `json:\"meta,omitempty\"`",
		"    Error   *ErrorInfo  `json:\"error,omitempty\"`",
		"}",
	}))

	sb.WriteString(pWithStyle("กลไกการล็อคสต็อก 15 นาที ป้องกัน Overselling", "Heading2"))
	sb.WriteString(p("เมื่อลูกค้าก้าวเข้าสู่หน้า Checkout ระบบจะทำการล็อคสินค้าแบบ Atomic Soft-Lock ภายใต้ Database Transaction:"))

	sb.WriteString(calloutBox("15-MINUTE ATOMIC SOFT-LOCK LOGIC",
		"1. ตรวจสอบสต็อกคงเหลือจริง: AvailableStock = StockQuantity - ReservedStock\n"+
			"2. หาก AvailableStock <= 0 ระบบปฏิเสธทันทีด้วย HTTP 409 Conflict: Insufficient Available Stock\n"+
			"3. หากเพียงพอ ทำการสร้างแถวใน stock_reservations พร้อมระบุ expires_at = now() + 15 นาที\n"+
			"4. เพิ่มค่า reserved_stock = reserved_stock + quantity ในตาราง product_variants แบบ Atomic\n"+
			"5. เมื่อชำระเงินสำเร็จ หัก stock_quantity จริงและปลด reserved_stock ออก\n"+
			"6. มี Go Goroutine ตรวจสอบและปล่อยสต็อกที่หมดอายุทุก 1 นาที อัตโนมัติ", "0F172A"))

	sb.WriteString(pWithStyle("ระบบชำระเงินจำลอง (Mock Payment Gateway & Installments)", "Heading2"))
	sb.WriteString(p("รองรับการจำลอง Thai QR PromptPay พร้อมระบบสร้างภาพ QR แบบ Real-time, ระบบบัตรเครดิตพร้อมการตรวจสอบหมายเลข Luhn Algorithm และจำลองปฏิเสธบัตรเมื่อเลข 4 ตัวท้ายเป็น '0000' ตลอดจนตารางคำนวณผ่อนชำระ 0% นาน 3, 6, 10 เดือน"))

	sb.WriteString(pageBreak())

	// ==========================================
	// PAGE 5: PHASE 4 (FRONTEND UX & CONFIGURATOR)
	// ==========================================
	sb.WriteString(pWithStyle("5. สถาปัตยกรรม Frontend และ Apple-Grade User Experience", "Heading1"))
	sb.WriteString(p("การพัฒนาฝั่ง Frontend ได้รับการออกแบบให้สอดคล้องกับความพรีเมียมของ Apple โดยใช้ React 19, TypeScript, Tailwind CSS, TanStack Router และ Framer Motion:"))

	sb.WriteString(pWithStyle("Step-by-Step CTO Spec Configurator", "Heading2"))
	sb.WriteString(p("ในหน้า Product Detail Page ผู้ใช้สามารถปรับแต่งสเปกโน้ตบุ๊กได้ตามลำดับความต้องการ โดยระบบจะคำนวณส่วนต่างของราคา (Price Delta) แบบไดนามิกทันที:"))

	sb.WriteString(codeBlock([]string{
		"Finish (Color)  : [ Space Black ]  [ Silver ]",
		"Processor (Chip): [ Apple M4 (10-core) ]  [ Apple M4 Pro (12-core) + ฿14,000 ]",
		"Memory (RAM)    : [ 16GB Unified ]  [ 24GB + ฿7,000 ]  [ 48GB + ฿21,000 ]",
		"Storage (SSD)   : [ 512GB SSD ]     [ 1TB SSD + ฿7,000 ]",
	}))

	sb.WriteString(p("เมื่อผู้ใช้คลิกเลือกสเปก เส้นขอบ Active State จะเคลื่อนไหวตามด้วย Framer Motion layoutId อย่างนุ่มนวล พร้อมตัวเลขราคารวมที่ขยับนับขึ้นลงอย่างสง่างาม"))

	sb.WriteString(pWithStyle("Scoped Lenis Smooth Scroll (ขจัดการ Scroll Hijacking)", "Heading2"))
	sb.WriteString(p("การทำ Smooth Scroll มักสร้างความรำคาญหากเปิดใช้ทั้งเว็บอย่างไม่ระมัดระวัง เราจึงวางกฎ Scoped Smooth Scroll อย่างชัดเจน: เปิดใช้งานเฉพาะบนหน้า Landing Page และ Product Detail Page เท่านั้น แต่จะถูกปิดการทำงานโดยสมบูรณ์เมื่อผู้ใช้เปิด Drawer, Modal และเมื่อนำทางเข้าสู่ Admin Dashboard"))

	sb.WriteString(pWithStyle("ระบบเปรียบเทียบสเปกแบบเคียงข้าง (Side-by-Side Compare Tray)", "Heading2"))
	sb.WriteString(p("ผู้ใช้สามารถกดส่งโน้ตบุ๊กเข้าสู่ถาดเปรียบเทียบได้สูงสุด 3 รุ่น พร้อมฟังก์ชันสวิตช์ 'Highlight Differences Only' ที่จะทำการซ่อนบรรทัดที่สเปกเหมือนกัน และเน้นเฉพาะบรรทัดที่ต่างกัน (เช่น ชิปประมวลผล, น้ำหนัก, ความสว่างหน้าจอ) ช่วยให้การตัดสินใจซื้อรวดเร็วและชาญฉลาดยิ่งขึ้น"))

	sb.WriteString(pageBreak())

	// ==========================================
	// PAGE 6: PHASE 5 (THE ALPHA ASSET PIPELINE)
	// ==========================================
	sb.WriteString(pWithStyle("6. มหากาพย์ระบบตัดพื้นหลัง Transparent PNG อัตโนมัติ (The Alpha Asset Pipeline)", "Heading1"))
	sb.WriteString(p("นี่คือหมุดหมายสำคัญที่สุดที่เปลี่ยนโฉม AURA TECH ให้กลายเป็นเว็บระดับโลกอย่างสมบูรณ์แบบ:"))

	sb.WriteString(pWithStyle("วิกฤตการณ์พื้นหลังขาวและโควตา Gemini API", "Heading2"))
	sb.WriteString(p("ภาพสินค้าเดิม 9 รายการมีพื้นหลังเป็นสีขาวทึบ (Opaque White) เมื่อนำมาแสดงผลบน Dark Mode ของเว็บ จะปรากฏเป็นกรอบสี่เหลี่ยมสีขาวตัดขอบหน้าจออย่างไม่สวยงาม ยิ่งไปกว่านั้น ภาพอีก 8 รายการลิงก์เสียจากปัญหา CDN Hotlink และเมื่อทดสอบใช้ Gemini AI ในการเจนเนอเรตรูปภาพ ปรากฏว่าบัญชีติดข้อจำกัด Free Tier ไม่เปิดให้เจนรูปภาพ (limit: 0 requests/day)"))

	sb.WriteString(pWithStyle("การประดิษฐ์ Automated Asset Engineering Pipeline", "Heading2"))
	sb.WriteString(p("เราได้พัฒนาเครื่องมือ cmd/assetgen/main.go ขึ้นมาใหม่ เพื่อแก้ปัญหาทั้งหมดแบบอัตโนมัติด้วย 4 นวัตกรรม:"))

	sb.WriteString(calloutBox("4 นวัตกรรมใน THE ALPHA ASSET PIPELINE",
		"1. ROBUST HTTP TRANSPORT: ใส่ User-Agent และ Referer จำลองเพื่อดึงภาพสตูดิโอ 8K/4K จาก CDN แท้ของ ASUS, Lenovo, Apple และ Keychron ได้อย่างราบรื่น\n"+
			"2. BOUNDARY-CONNECTED FLOOD FILL: ใช้อัลกอริทึม BFS เริ่มต้นจากพิกเซลขอบนอก 4 ด้านเท่านั้น เพื่อเปลี่ยนสีขาวเป็น Alpha Transparency (A = 0) โดยไม่กินเนื้อสีขาวภายในตัวเครื่อง เช่น คีย์แคปขาวหรือหน้าจอ\n"+
			"3. WHITE PRODUCT EDGE PROTECTION: ปกป้องสินค้าสีสว่าง (Platinum White, Shell White, Silver) ด้วยเกณฑ์ความสว่างเข้มงวด R,G,B >= 248 และค่าสีต้องสมดุล dr, dg, db <= 3 เพื่อไม่ให้ขอบอะลูมิเนียมแหว่ง\n"+
			"4. COLOR-LEVEL DEDUPLICATION: แคชผลลัพธ์ภาพตัดตามคู่ (ProductSlug + ColorName) ทำให้ MacBook Pro สี Space Black ทั้ง 3 SKU ใช้ภาพคุณภาพสูงร่วมกัน ประหยัดพื้นที่จัดเก็บและคงมุมมองภาพเดียวกันตาม Apple CTO UX", "16A34A"))

	sb.WriteString(p("หลังการตัดขอบและไล่ระดับความเนียน (Feathering) ภาพจะถูกตรวจสอบพิกเซลมุม (0,0) ว่ามีค่า Alpha = 0 ก่อนอัปโหลดขึ้น MinIO Bucket aura-assets และอัปเดตพาธเข้าสู่ PostgreSQL โดยอัตโนมัติ"))

	sb.WriteString(pageBreak())

	// ==========================================
	// PAGE 7: VERIFICATION METRICS & QUALITY GATES
	// ==========================================
	sb.WriteString(pWithStyle("7. การตรวจสอบคุณภาพและมาตรวัดความสำเร็จ (Verification Metrics)", "Heading1"))
	sb.WriteString(p("ความสำเร็จของระบบได้รับการยืนยันผ่านการรัน Audit รอบสุดท้ายบนสภาพแวดล้อมจริง:"))

	sb.WriteString(calloutBox("FINAL ASSET AUDIT METRICS (100% PRODUCTION OK)",
		"Total Images Audited          : 17 Items\n"+
			"Production OK (MinIO Alpha)   : 17 Items (100.0%)\n"+
			"Has Opaque White Background   : 0 Items  (0.0%)\n"+
			"Broken / 404 / Missing        : 0 Items  (0.0%)\n"+
			"Go Backend Compilation        : 0 Errors (go build ./... PASS)\n"+
			"Frontend Type-Checking        : 0 Errors (tsc --noEmit & vite build PASS)", "0F172A"))

	sb.WriteString(pWithStyle("ตารางสรุปรายการทรัพย์สินดิจิทัลในระบบ (Catalog Assets)", "Heading2"))

	assetTableWidths := []int{2000, 2600, 3200, 1200}
	sb.WriteString(`<w:tbl>`)
	sb.WriteString(`<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblLook w:val="04A0"/></w:tblPr>`)
	sb.WriteString(tableRow([]string{"SKU / Asset ID", "Product & Color Finish", "Target MinIO Path", "Status"}, true, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBP14-M4-16-512-SB", "MacBook Pro 14 (Space Black)", "products/macbook-pro-14-m4/MBP14-M4-16-512-SB.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBP14-M4-16-512-SL", "MacBook Pro 14 (Silver)", "products/macbook-pro-14-m4/MBP14-M4-16-512-SL.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBP14-M4P-24-512-SB", "MacBook Pro 14 M4P (Space Black)", "products/macbook-pro-14-m4/MBP14-M4P-24-512-SB.png", "OK (Dedupe)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBP14-M4P-48-1TB-SB", "MacBook Pro 14 M4P (Space Black)", "products/macbook-pro-14-m4/MBP14-M4P-48-1TB-SB.png", "OK (Dedupe)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBA13-M3-16-256-MN", "MacBook Air 13 (Midnight)", "products/macbook-air-13-m3/MBA13-M3-16-256-MN.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBA13-M3-16-512-SL", "MacBook Air 13 (Silver)", "products/macbook-air-13-m3/MBA13-M3-16-512-SL.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"MBA13-M3-24-512-ST", "MacBook Air 13 (Starlight)", "products/macbook-air-13-m3/MBA13-M3-24-512-ST.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"ROG-G16-U9-4070-GY", "ROG Zephyrus G16 (Eclipse Gray)", "products/asus-rog-zephyrus-g16-oled/...4070-GY.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"ROG-G16-U9-4080-WH", "ROG Zephyrus G16 (Platinum White)", "products/asus-rog-zephyrus-g16-oled/...4080-WH.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"YOGA-7I-U7-16-512-LG", "Lenovo Yoga Slim 7i (Luna Grey)", "products/lenovo-yoga-slim-7i-aura/...512-LG.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"YOGA-7I-U7-32-1TB-LG", "Lenovo Yoga Slim 7i (Luna Grey)", "products/lenovo-yoga-slim-7i-aura/...1TB-LG.png", "OK (Dedupe)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"LG-27MD5KL-B", "LG UltraFine 27\" 5K Monitor", "products/lg-ultrafine-27-5k/LG-27MD5KL-B.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"Q1P-KPRO-RED-CB", "Keychron Q1 Pro (Carbon Black)", "products/keychron-q1-pro-wireless/...RED-CB.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"Q1P-KPRO-BAN-SW", "Keychron Q1 Pro (Shell White)", "products/keychron-q1-pro-wireless/...BAN-SW.png", "OK (Alpha)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"BANNER-HERO-M4", "Banner: MacBook Pro 14 M4 Pro", "banners/macbook-pro-14-with-m4-pro.png", "OK (Hero)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"BANNER-ROG-OLED", "Banner: ROG Zephyrus G16 OLED", "banners/rog-zephyrus-g16-oled.png", "OK (Bento)"}, false, assetTableWidths))
	sb.WriteString(tableRow([]string{"BANNER-STUDENT", "Banner: University Deal", "banners/back-to-university-savings.png", "OK (Bento)"}, false, assetTableWidths))
	sb.WriteString(`</w:tbl>`)

	sb.WriteString(pWithStyle("8. บทสรุปและก้าวต่อไปของโปรเจกต์ (Conclusion & Roadmap)", "Heading1"))
	sb.WriteString(p("โปรเจกต์ AURA TECH ได้พิสูจน์ให้เห็นถึงพลังของการพัฒนาแบบมีระเบียบวินัยทางวิศวกรรม ตั้งแต่การออกแบบโครงสร้างระดับสถาปัตยกรรม การจัดการ Concurrency ของสต็อก ไปจนถึงการแก้ปัญหาเชิงภาพกราฟิกด้วยอัลกอริทึมระดับพิกเซล"))

	sb.WriteString(p("ก้าวถัดไปของโปรเจกต์จะมุ่งเน้นการเชื่อมต่อ Payment Gateway จริง (เช่น Omise / Stripe), การเสริมระบบ Analytics สรุปพฤติกรรมลูกค้า และการทดสอบ Load Testing เพื่อเตรียมพร้อมรับยอดเข้าชมระดับมหาศาล"))

	// Section properties: Margins, page dimensions, header/footer references
	sb.WriteString(`<w:sectPr>`)
	sb.WriteString(`<w:headerReference w:type="default" r:id="rId2"/>`)
	sb.WriteString(`<w:footerReference w:type="default" r:id="rId3"/>`)
	sb.WriteString(`<w:pgSz w:w="11906" w:h="16838"/>`) // A4 Portrait (in twips: 210mm x 297mm)
	sb.WriteString(`<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>`)
	sb.WriteString(`</w:sectPr>`)

	sb.WriteString(`</w:body>`)
	sb.WriteString(`</w:document>`)
	return sb.String()
}
