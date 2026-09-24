with open(".env", "r") as source, open(".env.example", "w") as target:
    for line in source:
        if line.strip() and not line.startswith("#") and "=" in line:
            key = line.split("=")[0]
            target.write(f"{key}=\n")
        else:
            target.write(line)  # Keeps comments and formatting intact
