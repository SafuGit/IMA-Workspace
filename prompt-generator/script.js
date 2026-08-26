document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('generatorForm');
    const typeRadios = document.getElementsByName('outreachType');
    const brandSection = document.getElementById('brandSection');
    const resultContainer = document.getElementById('resultContainer');
    const promptOutput = document.getElementById('promptOutput');
    const copyBtn = document.getElementById('copyBtn');
    
    // Toggle fields based on outreach type
    const updateVisibility = () => {
        const type = document.querySelector('input[name="outreachType"]:checked').value;
        if (type === 'influencer') {
            brandSection.style.display = 'none';
        } else {
            brandSection.style.display = 'block';
        }
    };

    typeRadios.forEach(radio => {
        radio.addEventListener('change', updateVisibility);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const type = document.querySelector('input[name="outreachType"]:checked').value;
        
        // Brand fields
        const brandName = document.getElementById('brandName').value.trim() || "[BRAND NAME]";
        const brandLink = document.getElementById('brandLink').value.trim() || "[BRAND LINK]";
        const brandVideos = document.getElementById('brandVideos').value.trim();
        
        // Creator fields
        const creatorName = document.getElementById('creatorName').value.trim() || "[CREATOR NAME]";
        const creatorLink = document.getElementById('creatorLink').value.trim() || "[CREATOR LINK]";
        const creatorVideos = document.getElementById('creatorVideos').value.trim();

        let promptText = "";

        if (type === 'brand') {
            let videoInstruction = `If either is a YouTube video, use video-personalization (transcript + top comments) to find a hook a normal viewer would notice — not a technical deep-cut.`;
            if (brandVideos) {
                videoInstruction = `For this here is a video in which ${brandName} already did a sponsorship in ${brandVideos}. ` + videoInstruction;
            }
            if (creatorVideos) {
                videoInstruction += ` Also consider these creator videos: ${creatorVideos}.`;
            }

            promptText = `Using the fylint-agency skill for context and role, contact the brand ${brandName} (${brandLink}) on behalf of the creator ${creatorName} (${creatorLink}).

1. Check ${brandLink} and ${creatorLink} for a real personalization detail. ${videoInstruction} If it's a LinkedIn post, article, or blog, pull one specific detail or stated opinion the same way.

2. Confirm actual audience/niche overlap between ${brandName} and ${creatorName} using the creator's real stats (subscribers, recent views) — don't assert "great fit" without checking.

3. Write the draft in Safwan's actual voice (safwan-voice skill) — greeting, sign-off, contractions, not the stripped cold-email formula.

4. Structure it with cold-email's framework: one ask, one CTA.

5. Anonymize the creator per the standing rule — describe by niche + stats, not name or channel link, since this is a brand pitch pre-contract.

6. Run it through spam-word-checker before presenting — flag and fix anything that would hurt deliverability.

7. Present the final draft plus 1-2 alternate hooks you considered, so I can override your pick if needed.

If a link doesn't yield a real, usable detail, say so — don't invent a quote, stat, or moment that isn't actually there.`;
        } else {
            // Influencer Outreach
            let videoInstruction = `If the link is a YouTube channel, use video-personalization (transcript + top comments) to find a hook a normal viewer would notice — not a technical deep-cut.`;
            if (creatorVideos) {
                videoInstruction = `Use these extra videos for personalization: ${creatorVideos}. ` + videoInstruction;
            }

            promptText = `Using the fylint-agency skill for context and role, contact the creator ${creatorName} (${creatorLink}) on behalf of Fylint.

1. Check ${creatorLink} for a real personalization detail. ${videoInstruction} If it's a LinkedIn post, article, or blog, pull one specific detail or stated opinion the same way.

2. Review the creator's actual stats (subscribers, recent views) to ensure they fit our agency's criteria.

3. Write the draft in Safwan's actual voice (safwan-voice skill) — greeting, sign-off, contractions, not the stripped cold-email formula.

4. Structure it with cold-email's framework: one ask, one CTA.

5. Run it through spam-word-checker before presenting — flag and fix anything that would hurt deliverability.

6. Present the final draft plus 1-2 alternate hooks you considered, so I can override your pick if needed.

If a link doesn't yield a real, usable detail, say so — don't invent a quote, stat, or moment that isn't actually there.`;
        }

        promptOutput.value = promptText;
        resultContainer.classList.remove('hidden');
        
        // Scroll to result
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    });

    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(promptOutput.value);
            
            // Visual feedback
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            
            // Fallback for older browsers
            promptOutput.select();
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('copied');
            }, 2000);
        }
    });

    // Initialize visibility
    updateVisibility();
});
