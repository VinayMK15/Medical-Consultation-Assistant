import logging
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

load_dotenv()

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Initialize logger for email service
logger = logging.getLogger(__name__)

def _send_email(to_email: str, subject: str, html_body: str):
    """Low-level SMTP sender"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured. Skipping email to %s", to_email)
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"MedAssist <{SMTP_EMAIL}>"
        msg["To"] = to_email

        part = MIMEText(html_body, "html")
        msg.attach(part)

        # Connect to Gmail SMTP server
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        server.quit()
        logger.info("Email sent successfully to %s", to_email)
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, str(e))

def _get_base_template(content: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #334155; }}
            .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }}
            .header {{ background-color: #0f766e; padding: 20px; color: #ffffff; text-align: center; font-size: 24px; font-weight: bold; }}
            .header-cancel {{ background-color: #ea580c; }}
            .header-complete {{ background-color: #16a34a; }}
            .content {{ padding: 30px; }}
            .card {{ background-color: #f1f5f9; padding: 20px; border-radius: 6px; margin: 20px 0; }}
            .btn {{ display: inline-block; background-color: #0f766e; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }}
            .footer {{ background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }}
            h2 {{ color: #0f172a; margin-top: 0; }}
            p {{ line-height: 1.6; margin-bottom: 15px; }}
        </style>
    </head>
    <body>
        {content}
    </body>
    </html>
    """

def _format_time(time_str: str) -> str:
    try:
        dt = datetime.strptime(time_str, "%H:%M")
        return dt.strftime("%I:%M %p").lstrip("0")
    except Exception:
        return time_str


def send_password_reset_email(email: str, reset_token: str):
    """Send the reset token only in a time-limited email link, never an API response."""
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    html = _get_base_template(f"""
        <div class="container">
            <div class="header">MedAssist</div>
            <div class="content">
                <h2>Reset your password</h2>
                <p>Use the link below to set a new password. It expires in 15 minutes.</p>
                <a href="{reset_link}" class="btn">Reset Password</a>
                <p>If you did not request this, you can safely ignore this email.</p>
            </div>
            <div class="footer">For your security, do not share this link with anyone.</div>
        </div>
    """)
    _send_email(email, "MedAssist password reset", html)


def send_password_reset_code_email(email: str, code: str):
    """Email a short verification code for an in-app password change.

    Used when the patient is already signed in (Settings), where staying in
    the app beats following a link out to an email client and back.
    """
    spaced = " ".join(code)  # 1 2 3 4 5 6 — far easier to read aloud or retype
    html = _get_base_template(f"""
        <div class="container">
            <div class="header">MedAssist</div>
            <div class="content">
                <h2>Confirm it's you</h2>
                <p>Use this code to set a new password. It expires in 10 minutes.</p>
                <div style="font-size:34px;letter-spacing:10px;font-weight:700;
                            text-align:center;margin:26px 0;padding:20px;
                            background:#f1f5f9;border-radius:8px;
                            font-family:'Courier New',monospace;">
                    {spaced}
                </div>
                <p>If you did not request this, you can safely ignore this email
                   &mdash; no one can change your password without this code.</p>
            </div>
            <div class="footer">For your security, never share this code with anyone.</div>
        </div>
    """)
    _send_email(email, f"{code} is your MedAssist verification code", html)

def send_booking_confirmation(patient_email: str, doctor_email: str, details: dict):
    formatted_time = _format_time(details['time'])
    subject = f"✅ Appointment Confirmed — {details['date']} at {formatted_time}"

    address = details.get('practice_address') or 'Clinic Address Not Provided'
    lat = details.get('practice_lat')
    lng = details.get('practice_lng')

    maps_link_html = ""
    if lat and lng:
        maps_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
        maps_link_html = f'<p><a href="{maps_link}" target="_blank" style="color: #0f766e; text-decoration: underline;">View on Google Maps</a></p>'
    elif address and address != 'Clinic Address Not Provided':
        # Fallback to address search if lat/lng are missing but address is present
        import urllib.parse
        encoded_address = urllib.parse.quote(address)
        maps_link = f"https://www.google.com/maps/search/?api=1&query={encoded_address}"
        maps_link_html = f'<p><a href="{maps_link}" target="_blank" style="color: #0f766e; text-decoration: underline;">View on Google Maps</a></p>'

    html = _get_base_template(f"""
        <div class="container">
            <div class="header">➕ MedAssist</div>
            <div class="content">
                <h2>Appointment Confirmed!</h2>
                <div class="card">
                    <p><strong>Patient Name:</strong> {details['patient_name']}</p>
                    <p><strong>Doctor Name:</strong> {details['doctor_name']}</p>
                    <p><strong>Specialty:</strong> {details.get('specialty', 'General Practice')}</p>
                    <p><strong>Date:</strong> {details['date']}</p>
                    <p><strong>Time:</strong> {formatted_time}</p>
                    <p><strong>Status:</strong> Confirmed</p>
                    <p><strong>Location:</strong> {address}</p>
                    {maps_link_html}
                </div>
                <p>Thank you for scheduling your appointment with Dr. {details['doctor_name'].split(' ')[-1]} at MedAssist. This email confirms that your consultation is successfully scheduled. We look forward to seeing you. Please arrive 15 minutes early to complete any necessary paperwork.</p>
                <a href="{FRONTEND_URL}/profile" class="btn">View My Appointments</a>
            </div>
            <div class="footer">
                © 2026 MedAssist, Inc. All rights reserved.<br>
                You are receiving this email because you scheduled an appointment with MedAssist.
            </div>
        </div>
    """)

    # Send to both patient and doctor
    _send_email(patient_email, subject, html)
    _send_email(doctor_email, subject, html)

def send_cancellation_notice(patient_email: str, doctor_email: str, details: dict):
    formatted_time = _format_time(details['time'])
    subject = f"❌ Appointment Cancelled — {details['date']} at {formatted_time}"

    html = _get_base_template(f"""
        <div class="container">
            <div class="header header-cancel">➕ MedAssist</div>
            <div class="content">
                <h2>Appointment Cancelled</h2>
                <div class="card">
                    <p><strong>Patient Name:</strong> {details['patient_name']}</p>
                    <p><strong>Doctor Name:</strong> {details['doctor_name']}</p>
                    <p><strong>Date:</strong> {details['date']}</p>
                    <p><strong>Time:</strong> {formatted_time}</p>
                    <p><strong>Status:</strong> Cancelled</p>
                </div>
                <p>This email is to notify you that the appointment scheduled for {details['date']} at {formatted_time} has been cancelled.</p>
                <a href="{FRONTEND_URL}" class="btn" style="background-color: #ea580c;">Book a New Appointment</a>
            </div>
            <div class="footer">
                © 2026 MedAssist, Inc. All rights reserved.
            </div>
        </div>
    """)

    _send_email(patient_email, subject, html)
    _send_email(doctor_email, subject, html)

def _format_prescription_notes_for_email(notes_raw: str) -> str:
    if not notes_raw:
        return "<p>No specific notes provided.</p>"
    import json
    try:
        data = json.loads(notes_raw)
        if isinstance(data, dict):
            html_parts = []
            if data.get("diagnosis"):
                html_parts.append(f"<p><strong>Provisional Diagnosis:</strong> {data['diagnosis']}</p>")
            v = data.get("vitals")
            if v and isinstance(v, dict) and any(v.values()):
                v_str = " | ".join(f"{k.upper()}: {val}" for k, val in v.items() if val)
                html_parts.append(f"<p><strong>Recorded Vitals:</strong> {v_str}</p>")
            meds = data.get("medications")
            if meds and isinstance(meds, list) and len(meds) > 0:
                html_parts.append("<p><strong>Prescribed Medications:</strong></p><ul style='margin-top: 4px; padding-left: 20px;'>")
                for m in meds:
                    html_parts.append(f"<li><strong>{m.get('name','')}</strong> — {m.get('dosage','')} | {m.get('frequency','')} | {m.get('duration','')} ({m.get('instructions','')})</li>")
                html_parts.append("</ul>")
            if data.get("advice"):
                html_parts.append(f"<p style='margin-top: 8px;'><strong>Doctor's Advice & Plan:</strong><br>{data['advice']}</p>")
            if html_parts:
                return "".join(html_parts)
    except Exception:
        pass
    return f"<p style='white-space: pre-wrap;'>{notes_raw}</p>"

def send_completion_summary(patient_email: str, details: dict):
    subject = f"📋 Appointment Summary — {details['doctor_name']}"
    formatted_notes = _format_prescription_notes_for_email(details.get('prescription_notes'))

    html = _get_base_template(f"""
        <div class="container">
            <div class="header header-complete">➕ MedAssist</div>
            <div class="content">
                <h2>Appointment Complete</h2>
                <p>Your appointment with {details['doctor_name']} on {details['date']} is complete.</p>
                <div class="card">
                    <h3>Prescription & Consultation Summary:</h3>
                    {formatted_notes}
                </div>
                <p>We hope you feel better soon! You can review your full consultation history and print your official medical report on your dashboard.</p>
                <a href="{FRONTEND_URL}/profile" class="btn" style="background-color: #16a34a;">View & Print Full Report</a>
            </div>
            <div class="footer">
                © 2026 MedAssist, Inc. All rights reserved.
            </div>
        </div>
    """)

    _send_email(patient_email, subject, html)
