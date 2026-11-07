"""Throwaway email services: accounts made with them are refused (anti-abuse for the free plan).

A short list of the most used ones; it does not need to be complete, only to stop the easy cases.
"""

DOMAINS = frozenset("""
10minutemail.com 10minutemail.net 20minutemail.com 33mail.com anonaddy.me burnermail.io byom.de cock.li
discard.email dispostable.com dropmail.me emailondeck.com emailtemp.org fakeinbox.com fakemail.net
getairmail.com getnada.com guerrillamail.biz guerrillamail.com guerrillamail.de guerrillamail.info
guerrillamail.net guerrillamail.org guerrillamailblock.com harakirimail.com inboxkitten.com incognitomail.org
jetable.org mail-temp.com mail.tm mailcatch.com maildrop.cc mailinator.com mailinator.net mailinator.org
mailnesia.com mailpoof.com mailsac.com mintemail.com moakt.com mohmal.com mytemp.email mytrashmail.com
nada.email nada.ltd neverbox.com noclickemail.com nowmymail.com sharklasers.com spam4.me spambog.com
spamgourmet.com spambox.us temp-mail.io temp-mail.org tempail.com tempinbox.com tempm.com tempmail.com
tempmail.dev tempmail.net tempmail.plus tempmailo.com tempr.email throwawaymail.com trash-mail.com
trashmail.com trashmail.de trashmail.io trashmail.net tmail.ws tmpmail.net tmpmail.org yopmail.com
yopmail.fr yopmail.net emailfake.com fexpost.com fexbox.org mailto.plus inboxbear.com spamex.com
grr.la pokemail.net mvrht.com vomoto.com linshiyouxiang.net 1secmail.com 1secmail.net 1secmail.org
""".split())


def is_disposable(email: str) -> bool:
    domain = (email or "").rsplit("@", 1)[-1].strip().lower()
    return domain in DOMAINS or any(domain.endswith("." + d) for d in DOMAINS)
