# Language Policy

This document outlines the language policy for the Buntspecht project.

## Overview

As of the latest update, Buntspecht follows an **English-first** language policy with German as a secondary language.

## Language Guidelines

### 1. Main Documentation (English)
- **README.md**: Primary documentation in English
- **Configuration examples**: All `.example.toml` files are in English only
- **Code comments**: English preferred for new code
- **Git commit messages**: Must always be in English
- **Issue templates and discussions**: English preferred

### 2. German Translation
- **README.de.md**: German translation of the main README
- **Maintained as translation**: Should be updated when README.md changes
- **Not automatically generated**: Manual translation required for accuracy

### 3. Code and Technical Content
- **Configuration files**: English comments and documentation
- **Error messages**: English (with potential for i18n in the future)
- **Log messages**: English
- **API documentation**: English

## Translation Workflow

### Checking Translation Status

Use the built-in script to check if the German README needs updating:

```bash
# Using npm script
npm run check:readme

# Or directly
node scripts/update-german-readme.js
```

### Updating German README

When the English README is updated:

1. **Automatic detection**: The CI pipeline will detect if README.de.md is outdated
2. **Manual translation**: Update README.de.md manually to match README.md
3. **Verification**: Run `npm run check:readme` to verify synchronization

### Translation Guidelines

When translating README.md to README.de.md:

- **Preserve structure**: Keep the same markdown structure and formatting
- **Keep code unchanged**: Don't translate code examples, commands, or configuration
- **Translate content**: Translate descriptive text, explanations, and documentation
- **Maintain links**: Ensure all links work in both versions
- **Use consistent terminology**: Maintain consistent German technical terms

## Automation

### CI/CD Integration

The GitHub Actions workflow includes:

- **Translation check**: Automatically detects when German README is outdated
- **Status reporting**: Reports in CI if translation is needed
- **Non-blocking**: Translation checks don't block the build process

### Future Enhancements

Planned improvements for the translation system:

- **Automated translation**: Integration with translation services (DeepL, Google Translate)
- **Template preservation**: Automatic preservation of code blocks and technical terms
- **Multi-language support**: Potential expansion to other languages
- **Translation validation**: Automated checks for translation completeness

## Migration Notes

### From German-first to English-first

This change was implemented to:

- **Improve accessibility**: Make the project more accessible to international contributors
- **Standardize development**: Align with common open-source practices
- **Maintain German support**: Keep German documentation for existing users
- **Facilitate contributions**: Lower barriers for international contributors

### Backward Compatibility

- **Existing German content**: Preserved and maintained
- **Configuration migration**: Old German configs still work, new examples in English
- **Documentation links**: Both language versions remain accessible

## Contributing

### For English Documentation
- Update README.md directly
- Follow standard markdown practices
- Use clear, concise language
- Include code examples where helpful

### For German Translation
- Update README.de.md after README.md changes
- Maintain consistency with English version
- Use appropriate German technical terminology
- Test all links and examples

### For Configuration Examples
- Use English comments and documentation
- Provide clear, self-explanatory examples
- Include comprehensive inline documentation
- Use meaningful variable names and values

## Tools and Scripts

### Available Scripts

```bash
# Check if German README needs updating
npm run check:readme

# Run all checks (including translation status)
npm run lint && npm run test && npm run check:readme
```

### Script Locations

- **Translation checker**: `scripts/update-german-readme.js`
- **CI integration**: `.github/workflows/ci.yml`
- **Package scripts**: `package.json`

## Support

For questions about the language policy or translation process:

1. **Check existing documentation**: Review this file and README files
2. **Use the scripts**: Run `npm run check:readme` for status
3. **Open an issue**: Create a GitHub issue for policy questions
4. **Contribute**: Submit PRs for documentation improvements

---

This language policy ensures consistent, accessible documentation while maintaining support for both English and German users.