"""Answers written by hand for questions the general rules can't settle (2026-11-24).

EXTRA_BY_NAME: a listing's name (any part of it) -> {question key: answer}. Values must be among the question's
options where it has options (fill.py checks). GENERIC: (seller category id, key) -> answer for every listing there.
"""

GENERIC = {
    ("logistics-supply-chain", "coverage"): ["PAN India"],
    ("logistics-supply-chain", "features"): ["24/7 Security", "CCTV", "Fire Safety"],
    ("logistics-supply-chain", "tradeLanes"): ["Middle East", "EU", "USA"],
    ("logistics-supply-chain", "vehicleTypes"): ["Tempo", "Mini Truck"],
    ("logistics-supply-chain", "shipmentTypes"): ["FCL", "LCL", "Air Cargo"],
    ("it-software-saas", "industry"): ["Apparel", "Textile"],
    ("it-software-saas", "industries"): ["Textile", "Apparel"],
    ("it-software-saas", "integrations"): ["Tally", "Shopify"],
    ("it-software-saas", "pricing"): "Flat Monthly",
    ("it-software-saas", "deployment"): "Cloud",
    ("finance-compliance", "clientTypes"): ["SMEs", "Manufacturers"],
    ("finance-compliance", "industries"): ["Apparel", "Textile"],
    ("marketing-pr-photography", "industries"): ["Fashion", "Textile"],
    ("freelancers-job-workers", "industries"): ["Fashion", "E-commerce"],
    ("freelancers-job-workers", "categories"): ["Womenswear", "Menswear"],
    ("freelancers-job-workers", "garmentTypes"): ["Woven Tops", "Knits", "Dresses"],
    ("printing-manufacturing", "garmentTypes"): ["T-Shirts", "Hoodies", "Cut Pieces"],
    ("printing-manufacturing", "fabricTypes"): ["Cotton", "Blends"],
    ("printing-manufacturing", "digitizing"): "In-house",
    ("printing-manufacturing", "machineHeads"): 12,
    ("printing-manufacturing", "maxArea"): "400 × 500 mm",
    ("printing-manufacturing", "specialFinishes"): ["Wrinkle Free", "Anti-microbial"],
    ("service-providers", "machines"): 60,
    ("service-providers", "monthlyCapacity"): "30,000 pieces a month",
    ("service-providers", "specialOperations"): ["Piping", "Pintucks"],
    ("service-providers", "categories"): ["Womenswear", "Menswear"],
    ("raw-materials", "weight"): 140,
    ("raw-materials", "threadCount"): 132,
    ("raw-materials", "construction"): "40s × 40s, 132 × 72",
    ("raw-materials", "finish"): ["Normal", "Sanforized"],
    ("raw-materials", "gsm"): 180,
    ("machinery-equipment", "model"): "Sample model (illustrative)",
    ("machinery-equipment", "warranty"): "1 year on parts",
    ("labels-tags", "backing"): "Iron-on",
    ("labels-tags", "hole"): "Round",
}

EXTRA_BY_NAME = {
    # Apparel & Home
    "Kids' printed cotton T-shirt": {"ageGroup": "4-6 Years", "apparelBottomType": "N/A", "gender": "Unisex", "length": "N/A"},
    "Women's everyday T-shirt bra": {"braClosure": "Back Hook", "coverage": "Full", "wiring": "Non-Wired"},
    "Unisex oversized drop-shoulder T-shirt": {"gsm": "220", "neckType": "Round Neck", "washCare": ["Machine Wash", "Do Not Bleach"]},
    "Men's cotton trunks, pack of 3": {"packOf": "3"},
    "Double bedsheet set, 300 TC cotton percale": {"setContains": "1 flat sheet and 2 pillow covers", "size": "274 × 274 cm (double)",
                                                   "washCare": ["Machine Wash", "Tumble Dry Low"]},
    "Soft cotton silk saree with blouse piece": {"sizes": ["Free Size"]},
    # Chemicals
    "Disperse dyes for polyester": {"fastness": ["Wash Fast", "Light Fast"]},
    "Enzyme for denim bio-wash": {"finish": ["Soft Hand"]},
    "Fixing agent for reactive prints": {"type": "Neutralizer", "finish": ["Soft Hand"]},
    "Silicone softener, hydrophilic": {"finish": ["Soft Hand", "Silky Feel"]},
    "Anti-pilling finish for knits": {"finish": ["Anti-pilling"]},
    # Cosmetics
    "Eau de parfum, 50 ml": {"topNotes": "Bergamot, pink pepper", "middleNotes": "Jasmine, rose", "baseNotes": "Sandalwood, musk",
                             "concentration": "Eau de parfum (15–18%)", "gender": "Unisex", "longevity": "6-8 Hours",
                             "sillage": "Moderate"},
    "Vitamin C face serum, 30 ml": {"concerns": ["Dullness", "Pigmentation"], "keyIngredients": ["Vitamin C", "Hyaluronic Acid"],
                                    "spf": "None"},
    "Aloe vera soothing gel, 100 g": {"concerns": ["Hydration", "Redness"], "spf": "None", "productType": "Moisturizer"},
    "Matte compact powder": {"coverage": "Medium", "longevity": "6-8 Hours", "volume": "9 g"},
    "Makeup brush set of 10": {"features": ["Cruelty-free", "Travel-friendly"]},
    "Tinted lip balm with SPF 15": {"features": ["Hydrating"], "finish": "Sheer", "formulation": "Tube", "longevity": "4-6 Hours",
                                    "productType": "Lip Balm", "volume": "4.5 g"},
    "Beard oil, 30 ml": {"features": ["Natural", "Paraben-free"]},
    "Quick-dry nail polish, 9 ml": {"finish": "Glossy"},
    # Fashion accessories
    "Digital sports watch": {"caseDiameter": "42", "strapMaterial": "Silicone", "waterResistance": "50m"},
    "Canvas laptop backpack": {"compartments": 3},
    "Faux-leather sling bag": {"compartments": 2},
    "Aviator metal-frame sunglasses": {"lensType": "UV Protected"},
    "Sports crew socks, 5-pair pack": {"material": "Cotton", "packOf": "5"},
    "Reversible PU belt": {"material": "Faux Leather"},
    "Knit touchscreen winter gloves": {"material": "Synthetic"},
    # Finance
    "Private limited company registration": {"additionalServices": ["MOA/AOA Drafting", "Director KYC"]},
    "IEC registration and export documentation": {"countries": ["Middle East", "EU", "USA"]},
    "Payroll with PF and ESIC filing": {"employeeRange": "1-50"},
    "Pitch deck and financial model": {"fundingStage": ["Pre-seed", "Seed"]},
    # Freelancers
    "Ecommerce product photoshoot": {"equipment": "DSLR, softbox lighting, white sweep"},
    "Micro-influencer campaign management": {"platforms": ["Instagram", "YouTube"]},
    "Model and stylist coordination": {"shootTypes": ["E-commerce", "Lookbook"]},
    "Seasonal collection design, 10 styles": {"software": ["Adobe Illustrator", "Photoshop", "CLO 3D"]},
    "Shopify store setup for a fashion label": {"tools": ["Figma", "WordPress"]},
    "Proto sample development": {"garmentTypes": ["Woven", "Knits"]},
    # IT
    "Custom fashion ecommerce website": {"appTypes": ["E-commerce"], "technologies": ["React", "Node.js"]},
    "B2B ordering app for wholesalers": {"technologies": ["React Native", "Node.js"]},
    "Digital catalogue microsite": {"listingTypes": ["Basic", "Premium"]},
    # Labels
    "Kraft paper hang tags": {"finish": ["Matte"]},
    "Foil-stamped premium hang tags": {"gsm": "350", "material": "Art Card", "finish": ["Foil Stamping"]},
    "Heat-transfer neck labels": {"material": "Polyester"},
    "Fibre content labels": {"material": "Satin"},
    "QR code hang tags": {"readRange": "Any phone camera, up to 30 cm"},
    "Woven size tags": {"shape": "Rectangular", "sizeRange": "XS to XXXL"},
    "Woven patches for jeans": {"weaveType": "Damask"},
    # Machinery
    "Straight-knife cutting machine, 8 inch": {"bladeSize": "8 inch", "cuttingHeight": 6},
    "GSM cutter and digital balance": {"calibration": "Calibrated"},
    "Industrial garment washer, 50 kg": {"capacity": 50},
    "DTF printer, 60 cm": {"colors": 6, "printArea": "60 cm wide roll", "speed": 8},
    "Four-thread overlock machine": {"drive": "Direct Drive", "voltage": "220V Single Phase"},
    "Single-head computerised embroidery machine": {"embroideryArea": "400 × 500 mm", "heads": 1, "maxSpeed": 1200},
    "Full-body fibreglass mannequin": {"finish": "Matte", "gender": "Female", "material": "Fiberglass"},
    "Steam iron with vacuum table": {"steamCapacity": 5, "tableDimensions": "1200 × 600 mm"},
    "Garment folding and polybag sealer": {"speed": 20},
    # Marketing
    "Meta and Google ads management": {"budgetRange": "<1 Lakh/month"},
    "Lookbook photoshoot with model": {"equipment": "Full-frame cameras, strobes, backdrops", "videoServices": ["Product Videos", "Reels"]},
    "Fashion PR launch campaign": {"mediaTypes": ["Digital", "Print"]},
    "Marketplace onboarding and catalogue upload": {"platforms": ["Amazon", "Flipkart", "Myntra"]},
    "Influencer barter campaign": {"platforms": ["Instagram", "YouTube"]},
    "Email newsletter campaigns": {"platforms": ["Mailchimp", "Klaviyo"]},
    # Packaging
    "Custom seal stickers": {"adhesive": "Permanent", "material": "Paper"},
    "3-ply corrugated shipping boxes": {"burstStrength": 12, "flute": "B Flute"},
    "Rigid gift boxes for apparel": {"finish": ["Matte Lamination", "Foil"]},
    "Kraft paper shopping bags": {"gsm": "120"},
    "Hang tag strings with plastic seals": {"length": "15 cm"},
    "Frosted ziplock bags": {"material": "LDPE"},
    "Thank-you cards and inserts": {"material": "350 GSM art card"},
    "Self-adhesive garment polybags": {"micron": "40"},
    # Printing & manufacturing
    "Yarn-dyeing job work": {"dyeTypes": ["Reactive", "Vat"]},
    "Garment dyeing": {"fabricTypes": ["Cotton", "Blends"]},
    "Fabric finishing, softener and stenter": {"fabricTypes": ["Woven", "Knits"], "processes": ["Washing", "Sanforizing", "Calendering"]},
    "Logo embroidery on garments": {"stitchTypes": ["Flat", "3D Puff"]},
    # Raw materials
    "Cotton combed yarn, 30s": {"count": "30s Ne", "ply": "Single", "twist": "Z Twist"},
    "Single jersey cotton knit": {"dyeType": "Piece Dyed", "shrinkage": "Under 5% after wash"},
    "Stretch denim fabric": {"oz": "10", "stretch": 25, "wash": ["Raw", "Rinse"]},
    "Knitted elastic tape, 25 mm": {"stretch": "Up to 120%"},
    "Polyester sewing thread, 5000 m": {"ticketNo": "120"},
    "Linen-cotton blend fabric": {"weaveType": "Plain"},
    # Service providers
    "Fabric cutting job work": {"cadSoftware": "Gerber", "layHeight": 6},
    "Third-party inline and final inspection": {"equipment": ["GSM Cutter", "Light Box"]},
    "Fabric sourcing agent": {"fabricTypes": ["Knits", "Wovens", "Denim"], "sourcingRegions": ["India"]},
    "Trims sourcing": {"services": ["Sampling", "Quality Check"], "sourcingRegions": ["India", "China"]},
    "Pattern making and grading on CAD": {"garmentTypes": ["Woven Tops", "Knits", "Dresses"], "software": ["Gerber", "CLO 3D"]},
    "Private label design support": {"software": ["Adobe Illustrator", "CLO 3D"]},
    # Trims
    "Metal jeans zippers, YKK-style": {"endType": "Closed End", "length": "7 inch", "size": "#5", "sliderType": "Auto Lock"},
    "Trouser hook and bar": {"finish": "Nickel", "material": "Steel", "size": "2"},
    "Polyester shirt buttons, 4-hole": {"finish": "Polished"},
    "Spring cord locks": {"material": "Plastic"},
    "Embroidered iron-on patches": {"shape": "Round"},
    "Copper rivets for denim": {"size": "8"},
    "Hook and loop tape, 25 mm": {"strength": "Standard"},
    "Silk tassels for ethnic wear": {"length": "3 inch"},
}

# Corrections after checking every listing's answers (2026-11-24). Merged over EXTRA_BY_NAME, so a listing named in
# both keeps its earlier answers and these win where they overlap.
EXTRA_CHECKED = {
    # Cosmetics
    "Handmade glycerin soap bar": {"packaging": "Box"},
    # Printing: None leaves a question unanswered when no option is true.
    "Digital printing on fabric": {"printTypes": None, "garmentTypes": ["Yardage"], "maxColors": "Unlimited (Digital)"},
    "Block printing by hand": {"printTypes": None, "garmentTypes": ["Yardage"], "maxColors": "1-4",
                               "turnaround": "1-2 weeks"},
    "DTF printing for garments": {"printTypes": ["DTF"], "garmentTypes": ["T-Shirts", "Hoodies", "Bags", "Caps"],
                                  "maxColors": "Unlimited (Digital)"},
    "Garment dyeing": {"turnaround": "3-7 days"},
    # Checked 2026-11-24 across the other categories
    "Women's rayon printed peplum top": {"topType": "Peplum"},
    "Women's tiered cotton midi dress": {"collarType": "N/A", "dressType": "Midi"},
    "Sequestering agent for hard water": {"chemicalType": "Pre-treatment"},
    "Levelling agent for reactive dyeing": {"application": ["Dyeing"]},
    "Anti-pilling finish for knits": {"type": None},
    "Stainless steel chain bracelet": {"material": None},
    "Digital sports watch": {"watchType": "Digital"},
    "Trend report for next season": {"services": ["Color Trends", "Fabric Trends", "Style Trends"]},
    "Trademark filing for a fashion brand": {"services": ["IP Registration"]},
    "Shopify store setup for a fashion": {"services": ["Web Development"], "tools": None},
    "Order automation with WhatsApp": {"features": ["WhatsApp Integration"]},
    "Proto sample development": {"services": ["Proto Development", "Pattern Making", "Sample Stitching"]},
    "Model and stylist coordination": {"workMode": "Hybrid"},
    "Woven patches for jeans": {"backing": "Plain"},
    "Full-truck load booking": {"vehicleTypes": ["Container", "Trailer"]},
    "Express B2B courier for samples": {"vehicleTypes": ["Bike", "Tempo"]},
    "Ecommerce last-mile delivery": {"vehicleTypes": ["Bike"]},
    "Air freight for export orders": {"services": ["Freight Forwarding", "Documentation"], "shipmentTypes": ["Air Cargo"]},
    "Sea freight FCL booking": {"shipmentTypes": ["FCL"]},
    "Meta and Google ads management": {"platforms": ["Google Ads", "Facebook Ads", "Instagram Ads"]},
    "WhatsApp broadcast campaigns": {"services": ["WhatsApp Business", "Campaign Management"]},
    "Fusible interlining": {"type": "Fusible", "weight": 40},
    "Cotton crochet lace": {"width": "2 inches"},
    "CMT stitching for T-shirts": {"garmentTypes": ["T-Shirts"], "specialOperations": None, "turnaround": "1-2 weeks"},
    "CMT stitching for shirts and kurta": {"garmentTypes": ["Shirts", "Ethnic Wear"], "turnaround": "1-2 weeks"},
    "Yarn-dyeing job work": {"turnaround": "1-2 weeks"},
    "Fabric finishing, softener and stenter": {"turnaround": "3-7 days"},
    "Enzyme and stone wash for garments": {"turnaround": "3-7 days"},
}


def extra_for(name, cat_id):
    """(the listing's own hand answers, its category's generic ones). Own answers must fit the question's options;
    a generic one is used only where it fits."""
    own = {}
    for table in (EXTRA_BY_NAME, EXTRA_CHECKED):
        for frag, ans in table.items():
            if frag.lower() in name.lower():
                own.update(ans)
    generic = {k: v for (c, k), v in GENERIC.items() if c == cat_id}
    return own, generic
