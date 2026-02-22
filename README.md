# StopAndShopCouponClipper
Clip all coupons on Stop and Shop account

## Introduction

This is a Chrome extension that adds a "Clip All Coupons" button to the
[StopAndShop coupons](https://stopandshop.com/savings/coupons/browse) page.
The Javascript action on this button will find all unloaded coupons and make 
the API call to load each one, adding all of them to the card.

## Installation

git clone this repository to your local disk or download the zip file and extract.

Go to the Chrome extensions page (chrome://extensions). You'll need to enable
developer mode in order to load an unpacked extension.

Click on "Load unpacked extension" and navigate to the folder in which you
cloned or extracted the source files. Select this folder to load the extension.

## Usage

Once you've installed and enabled this extension, go to
[StopAndShop coupons](https://stopandshop.com/savings/coupons/browse) 
page and find the "Clip All Coupons" button on the top left corner. Click on
it and wait for the progress bar to complete. Once it completes it 
will reload the page and all your coupons should be clipped. Note that this 
extension will clip maximum 90 coupons at a time. So if there are more than 90
coupons available to clip, you will have to wait for the first 90 to be clipped
and then click the button again to clip the next 90.

<img width="1324" height="899" alt="Screenshot 2026-02-22 at 10 37 43 AM" src="https://github.com/user-attachments/assets/7afdf219-c9d4-4a93-8e9c-531d04f5ab79" />

