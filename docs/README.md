# StockEasy shop documentation

Go-live and training materials for StockEasy pilots.

## Files

| Document | Markdown | Word | PDF |
|----------|----------|------|-----|
| Validation checklist | [validation-checklist.md](./validation-checklist.md) | [validation-checklist.docx](./validation-checklist.docx) | [validation-checklist.pdf](./validation-checklist.pdf) |
| SOP (daily procedures) | [sop-v1.md](./sop-v1.md) | [sop-v1.docx](./sop-v1.docx) | [sop-v1.pdf](./sop-v1.pdf) |
| Training guide | [training-guide-v1.md](./training-guide-v1.md) | [training-guide-v1.docx](./training-guide-v1.docx) | [training-guide-v1.pdf](./training-guide-v1.pdf) |

## Regenerate Word / PDF from markdown

From the `docs` folder:

```powershell
# PDF (uses Puppeteer via md-to-pdf)
npx --yes md-to-pdf validation-checklist.md sop-v1.md training-guide-v1.md

# Word
npx --yes @mohtasham/md-to-docx validation-checklist.md validation-checklist.docx
npx --yes @mohtasham/md-to-docx sop-v1.md sop-v1.docx
npx --yes @mohtasham/md-to-docx training-guide-v1.md training-guide-v1.docx
```

Edit the `.md` files first, then rerun the commands above.

## Tips

- Add shop screenshots to the Word files before printing the training guide.
- Print the validation checklist and fill in Pass/Fail by hand during go-live testing.
- Keep the SOP at the counter; use the training guide for new staff onboarding.
