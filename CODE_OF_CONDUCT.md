# GuildPass SDK Code of Conduct

GuildPass is an open-source project maintained by Adamantine Guild.

This Code of Conduct applies to everyone participating in the GuildPass SDK project, including maintainers, contributors, reviewers, issue participants, and community members.

Our goal is to maintain a professional, respectful, technically productive environment where contributors can collaborate effectively.

---

## Our Pledge

We pledge to make participation in the GuildPass community a respectful and harassment-free experience for everyone, regardless of:

- age;
- body size;
- visible or invisible disability;
- ethnicity;
- sex characteristics;
- gender identity or expression;
- level of experience;
- education;
- socioeconomic status;
- nationality;
- personal appearance;
- race;
- caste;
- colour;
- religion;
- sexual identity or orientation.

Contributors with different levels of experience should be able to participate without being dismissed, mocked, or treated unfairly.

---

## Expected Behaviour

Examples of behaviour that contributes to a healthy project include:

- treating other contributors with respect;
- discussing technical disagreements constructively;
- giving clear and actionable code-review feedback;
- accepting constructive feedback professionally;
- explaining concerns without attacking the contributor;
- keeping issue and pull-request discussions focused on the work;
- acknowledging mistakes and correcting them;
- respecting contributor ownership of assigned or claimed work;
- giving proper attribution where appropriate;
- following repository contribution and security policies;
- helping maintain the quality and reliability of the SDK.

Technical disagreement is expected in software development.

Disagreement should focus on:

```text
the implementation
the API contract
the architecture
the tests
the security implications
the issue requirements
```

and not on the person who wrote the code.

---

## Unacceptable Behaviour

Examples of unacceptable behaviour include:

- harassment;
- threats or intimidation;
- discriminatory or derogatory language;
- personal attacks;
- trolling;
- repeated hostile or disruptive comments;
- sexualised language or imagery;
- unwanted sexual attention;
- publishing another person's private information without permission;
- deliberately disrupting issue or pull-request discussions;
- impersonating another contributor or maintainer;
- knowingly submitting malicious code;
- attempting to bypass repository security controls;
- deliberately misleading maintainers about test results or implementation behaviour;
- plagiarism or claiming another contributor's work as your own.

Conduct that would reasonably be considered inappropriate in a professional open-source environment may also be subject to enforcement.

---

# Technical Discussions

GuildPass encourages detailed technical discussion.

Contributors may challenge:

- design decisions;
- architecture;
- APIs;
- implementation choices;
- test coverage;
- performance;
- security assumptions.

Strong disagreement is acceptable.

Personal hostility is not.

For example, prefer:

```text
This implementation does not appear to satisfy the concurrency requirement because...
```

instead of:

```text
You clearly do not understand concurrency.
```

Reviews should explain the technical problem wherever practical.

---

# Code Review Conduct

Reviewers should aim to provide feedback that is:

- specific;
- technically grounded;
- actionable;
- relevant to the pull request.

Avoid vague rejection such as:

```text
This is bad.
```

Prefer:

```text
This parser currently accepts malformed Stellar account IDs because it checks only the prefix. Please validate the full StrKey encoding and checksum.
```

Contributors should address legitimate review feedback without treating requested changes as personal criticism.

---

# Issue Conduct

GuildPass issues should remain focused on the work described in the issue.

Contributors should not:

- repeatedly claim issues they do not intend to work on;
- interfere with another contributor's assigned issue;
- pressure maintainers for immediate review;
- spam issues with unrelated promotion;
- duplicate another contributor's work intentionally;
- submit unrelated changes under an issue to obtain contribution credit.

If requirements are unclear, ask focused questions before making major assumptions.

---

# Independent Contributor Work

Many GuildPass campaign issues are intentionally designed so contributors can work independently.

When an issue contains an independence requirement:

- work from the current `main` branch;
- do not depend on another contributor's unmerged code;
- do not ask another contributor to restructure their work solely to support your issue;
- keep your contribution independently reviewable and mergeable.

This helps prevent contributors from blocking one another.

---

# Contribution Quality and Attribution

Contribution credit should reflect actual work performed.

Do not:

- copy another contributor's implementation without attribution;
- submit generated code you have not reviewed or understood;
- misrepresent test results;
- claim functionality that is not implemented;
- manipulate contribution history for recognition.

Using development tools, including AI-assisted tools, is not itself prohibited.

However, the contributor remains responsible for:

- understanding the submitted code;
- verifying its correctness;
- testing it;
- ensuring it satisfies the issue;
- ensuring it does not introduce security problems;
- responding to review questions about the implementation.

Submitting code generated by a tool does not transfer responsibility away from the contributor.

---

# Security Conduct

Security vulnerabilities must be handled according to:

```text
SECURITY.md
```

Do not publish exploit details in a public issue before maintainers have had a reasonable opportunity to investigate.

Do not:

- expose real credentials;
- publish private keys or Stellar secret seeds;
- deliberately exploit production infrastructure;
- use security testing as a reason to access data that does not belong to you.

Good-faith security research should minimise harm.

---

# Repository Automation

Do not intentionally attempt to bypass:

- CI checks;
- branch protections;
- review requirements;
- central PR automation;
- repository permissions.

Do not modify GitHub Actions or automation workflows as part of an unrelated issue in an attempt to make a pull request pass.

Automation problems should be reported separately.

---

# Scope

This Code of Conduct applies to GuildPass community spaces, including:

- GitHub repositories;
- issues;
- pull requests;
- code reviews;
- discussions;
- project communication channels;
- contributor programmes;
- events associated with GuildPass or Adamantine Guild.

It also applies when someone is officially representing the GuildPass community in another public space.

---

# Reporting Conduct Issues

Instances of abusive, harassing, threatening, or otherwise unacceptable behaviour may be reported privately to:

```text
cerealboxx123@gmail.com
```

Include enough information for the maintainers to understand what happened.

Where practical, include:

- links to the relevant issue, pull request, or discussion;
- screenshots or message references;
- the approximate date;
- a description of the behaviour.

Reports should not be used as a substitute for ordinary technical disagreement.

Maintainers will review conduct reports in context and determine an appropriate response.

---

# Enforcement Responsibilities

Project maintainers are responsible for interpreting and enforcing this Code of Conduct.

Maintainers may remove, edit, or reject:

- comments;
- commits;
- code;
- issues;
- pull requests;
- discussions;
- other contributions;

when they violate this policy.

Maintainers may also restrict or remove a contributor's ability to participate in GuildPass community spaces.

Enforcement should be proportionate to the severity, frequency, and context of the behaviour.

---

# Enforcement Guidelines

## 1. Correction

For a minor or first-time issue, maintainers may privately or publicly ask the contributor to correct the behaviour.

Possible actions include:

- editing or removing a comment;
- correcting attribution;
- moving an unrelated discussion;
- changing communication style.

---

## 2. Warning

Repeated or more serious behaviour may result in a formal warning.

The warning may describe:

- the behaviour that violated this policy;
- the expected change;
- consequences if the behaviour continues.

---

## 3. Temporary Restriction

Serious or repeated violations may result in temporary restrictions from:

- issues;
- pull requests;
- discussions;
- other community interactions.

---

## 4. Permanent Ban

Severe misconduct or continued violations after previous enforcement may result in permanent removal from GuildPass community spaces.

Examples may include:

- sustained harassment;
- threats;
- deliberate malicious activity;
- serious security abuse;
- repeated conduct violations after warnings.

---

# Maintainer Conduct

Maintainers are also subject to this Code of Conduct.

Maintainer status does not justify:

- harassment;
- personal attacks;
- discriminatory behaviour;
- misuse of repository permissions;
- unfair appropriation of contributor work.

Where a report concerns a maintainer, it should be handled by another appropriate project representative where possible.

---

# Good-Faith Participation

Not every mistake is misconduct.

Examples such as:

- misunderstanding an issue;
- submitting a buggy implementation;
- disagreeing with a maintainer;
- asking for clarification;
- proposing a different architecture;

are normal parts of open-source development when handled constructively.

Enforcement should focus on behaviour, not ordinary technical mistakes.

---

# Attribution

This Code of Conduct incorporates principles from the [Contributor Covenant](https://www.contributor-covenant.org/), version 2.1, while adding GuildPass-specific guidance for code reviews, contributor campaigns, security, automation, and technical collaboration.
