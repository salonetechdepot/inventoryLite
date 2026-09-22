# StockEasy shop documentation

Go-live, validation, and training materials for StockEasy pilots.

## Files

| Document | Markdown | Word | PDF |
|----------|----------|------|-----|
| **Software validation protocol** | [software-validation-protocol.md](./software-validation-protocol.md) | [software-validation-protocol.docx](./software-validation-protocol.docx) | [software-validation-protocol.pdf](./software-validation-protocol.pdf) |
| Validation checklist (test cases) | [validation-checklist.md](./validation-checklist.md) | [validation-checklist.docx](./validation-checklist.docx) | [validation-checklist.pdf](./validation-checklist.pdf) |
| SOP (daily procedures) | [sop-v1.md](./sop-v1.md) | [sop-v1.docx](./sop-v1.docx) | [sop-v1.pdf](./sop-v1.pdf) |
| Training guide | [training-guide-v1.md](./training-guide-v1.md) | [training-guide-v1.docx](./training-guide-v1.docx) | [training-guide-v1.pdf](./training-guide-v1.pdf) |

**How they fit together:** Use the **protocol** to plan and sign off validation; use the **checklist** to execute tests; use **SOP** + **training** for daily shop operations.

## Regenerate Word / PDF from markdown

From the `docs` folder:

```powershell
# PDF (uses Puppeteer via md-to-pdf)
npx --yes md-to-pdf software-validation-protocol.md validation-checklist.md sop-v1.md training-guide-v1.md

# Word
npx --yes @mohtasham/md-to-docx software-validation-protocol.md software-validation-protocol.docx
npx --yes @mohtasham/md-to-docx validation-checklist.md validation-checklist.docx
npx --yes @mohtasham/md-to-docx sop-v1.md sop-v1.docx
npx --yes @mohtasham/md-to-docx training-guide-v1.md training-guide-v1.docx
```

Edit the `.md` files first, then rerun the commands above.

## Tips

- Add shop screenshots to the Word files before printing the training guide.
- Print the validation checklist and fill in Pass/Fail by hand during go-live testing.
- Keep the signed protocol + checklist with your deployment records for audits.
- Keep the SOP at the counter; use the training guide for new staff onboarding.
