import random

# Categories and example phrases for different needs
categories = {
    "electronics": [
        "Looking for a {item} under ${price}.",
        "Need a {item} urgently, willing to pay ${price}.",
        "Can someone donate a {item}? Needed for work.",
        "Urgent: Seeking a {item}, budget ${price}.",
        "Looking to trade my {item} for another device.",
    ],
    "food": [
        "Looking for fresh {item} for delivery.",
        "Need a food bank that provides {item}.",
        "Seeking a restaurant that donates {item}.",
        "Emergency: Need {item} for a family in crisis.",
        "Any free meal programs providing {item}?",
    ],
    "medical supplies": [
        "Urgently need {item}, can't find it in stores.",
        "Seeking donations of {item} for a local clinic.",
        "Does anyone have extra {item} to spare?",
        "Need {item} for elderly care, please help!",
        "Looking for {item} at an affordable price.",
    ],
    "furniture": [
        "Looking for a {item}, budget ${price}.",
        "Need a second-hand {item} for my apartment.",
        "Can anyone donate a {item} to a family in need?",
        "Urgent: Need {item} for temporary housing.",
        "Looking for a {item}, must be in good condition.",
    ],
    "transportation": [
        "Need a ride to {location}, can pay ${price}.",
        "Looking for a used {item}, budget ${price}.",
        "Urgently need a {item} for daily commuting.",
        "Anyone selling a {item}? Need it ASAP.",
        "Looking to carpool to {location}, sharing gas costs.",
    ],
    "social assistance": [
        "Looking for volunteers to help with {cause}.",
        "Need assistance with {task}, any help appreciated.",
        "Seeking a community group that supports {cause}.",
        "Urgent: Need {task} assistance, please help!",
        "Looking for a support network for {cause}.",
    ],
    "education materials": [
        "Looking for {item} for school.",
        "Need help getting {item} for college.",
        "Can someone donate {item} for students in need?",
        "Urgent: Need {item} for an upcoming exam.",
        "Seeking affordable {item} for study purposes.",
    ],
    "home repairs": [
        "Looking for a handyman to fix {item}, budget ${price}.",
        "Need emergency repairs for {item}, urgent help needed.",
        "Can someone help install {item} at my home?",
        "Seeking professional repair service for {item}.",
        "DIY help needed for {item}, any tips?",
    ],
    "disaster recovery": [
        "Urgently need {item} for disaster relief efforts.",
        "Seeking donations of {item} for hurricane victims.",
        "Need volunteers to help distribute {item} to affected areas.",
        "Emergency: Need {item} for displaced families.",
        "Looking for shelters that provide {item}.",
    ],
    "financial aid": [
        "Need help covering {expense}, any support appreciated.",
        "Looking for grants to fund {cause}.",
        "Seeking emergency financial assistance for {situation}.",
        "Urgent: Need assistance with {expense}.",
        "Crowdfunding support needed for {situation}.",
    ],
}

# Expanded lists for better coverage
items = [
    "Xbox 360", "PlayStation 5", "MacBook Pro", "Samsung Galaxy S21", "iPhone 14", 
    "gaming PC", "bicycle", "couch", "heater", "textbooks", "wheelchair", 
    "tent", "blankets", "groceries", "baby formula", "first aid kit", "solar generator",
    "medication", "power bank", "sleeping bag", "toiletries", "winter coat"
]
prices = [50, 100, 200, 500, 1000, 1500, 2000, 3000]
locations = ["work", "school", "hospital", "grocery store", "airport", "train station"]
causes = ["flood victims", "homeless shelters", "animal rescue efforts", "fire victims"]
tasks = ["moving furniture", "filling out paperwork", "transporting supplies", "organizing donations"]
expenses = ["medical bills", "rent", "utility payments", "car repairs", "school fees"]
situations = ["job loss", "unexpected expenses", "eviction notice", "medical emergency"]

# Generate 5,000 entries
with open("train_data.txt", "w") as f:
    for _ in range(50000):
        category = random.choice(list(categories.keys()))
        template = random.choice(categories[category])
        entry = template.format(
            item=random.choice(items),
            price=random.choice(prices),
            location=random.choice(locations),
            cause=random.choice(causes),
            task=random.choice(tasks),
            expense=random.choice(expenses),
            situation=random.choice(situations),
        )
        f.write(entry + f" | Category: {category}\n")

print("✅ `train_data.txt` has been generated successfully!")

